require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { getDb } = require('../db/schema');
const { importCsvFile } = require('../scripts/importCSV');

const DEFAULT_YEARS = Array.from({ length: 15 }, (_, index) => 2009 + index);
const DATA_DIR = process.env.USCIS_DATA_DIR || path.join(__dirname, '..', 'data', 'uscis');
const AUTO_SYNC_ON_STARTUP = process.env.USCIS_SYNC_ON_STARTUP !== 'false';
const SCHEDULE_ENABLED = process.env.USCIS_SYNC_SCHEDULE_ENABLED !== 'false';
const SCHEDULE = process.env.USCIS_SYNC_SCHEDULE || '0 5 15 1 *';

const USCIS_CSV_URLS = DEFAULT_YEARS.map((year) => ({
  year,
  url: `https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-${year}.csv`,
}));

let currentRun = null;
let scheduledTask = null;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getConfiguredYears() {
  const raw = process.env.USCIS_SYNC_YEARS;
  if (!raw) {
    return DEFAULT_YEARS;
  }

  return raw
    .split(',')
    .map((value) => parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value));
}

function getCsvTargets(years = getConfiguredYears()) {
  const selectedYears = new Set(years);
  return USCIS_CSV_URLS.filter((item) => selectedYears.has(item.year));
}

function createRun(triggerSource, yearsRequested) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO data_sync_runs (trigger_source, status, years_requested, current_stage)
    VALUES (?, 'running', ?, 'starting')
  `).run(triggerSource, yearsRequested.join(','));

  currentRun = {
    id: result.lastInsertRowid,
    trigger_source: triggerSource,
    status: 'running',
    years_requested: yearsRequested,
    started_at: new Date().toISOString(),
    completed_at: null,
    files_downloaded: 0,
    files_imported: 0,
    records_imported: 0,
    current_year: null,
    current_stage: 'starting',
    error_message: null,
  };

  return currentRun;
}

function updateRunState(partial) {
  if (!currentRun) {
    return null;
  }

  currentRun = {
    ...currentRun,
    ...partial,
  };

  const db = getDb();
  db.prepare(`
    UPDATE data_sync_runs
    SET status = ?,
        completed_at = ?,
        files_downloaded = ?,
        files_imported = ?,
        records_imported = ?,
        current_year = ?,
        current_stage = ?,
        error_message = ?
    WHERE id = ?
  `).run(
    currentRun.status,
    currentRun.completed_at ? Math.floor(new Date(currentRun.completed_at).getTime() / 1000) : null,
    currentRun.files_downloaded,
    currentRun.files_imported,
    currentRun.records_imported,
    currentRun.current_year,
    currentRun.current_stage,
    currentRun.error_message,
    currentRun.id,
  );

  return currentRun;
}

async function downloadCsv(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(destinationPath, buffer);
}

function clearDemoDataIfNeeded() {
  const db = getDb();
  const { totalRecords } = db.prepare('SELECT COUNT(*) AS totalRecords FROM h1b_records').get();

  if (!totalRecords) {
    return false;
  }

  const { demoImports } = db.prepare(
    `SELECT COUNT(*) AS demoImports FROM data_imports WHERE filename = 'seed_demo.js'`
  ).get();
  const { realImports } = db.prepare(
    `SELECT COUNT(*) AS realImports FROM data_imports WHERE filename != 'seed_demo.js'`
  ).get();

  if (!demoImports || realImports) {
    return false;
  }

  const wipeDemo = db.transaction(() => {
    db.prepare('DELETE FROM h1b_records').run();
    db.prepare(`DELETE FROM data_imports WHERE filename = 'seed_demo.js'`).run();
  });
  wipeDemo();
  return true;
}

async function runSync({
  triggerSource = 'manual',
  years = getConfiguredYears(),
} = {}) {
  if (currentRun && currentRun.status === 'running') {
    return {
      started: false,
      run: currentRun,
    };
  }

  ensureDataDir();
  clearDemoDataIfNeeded();

  const targets = getCsvTargets(years);
  const run = createRun(triggerSource, years);

  try {
    for (const target of targets) {
      updateRunState({
        current_year: target.year,
        current_stage: 'downloading',
      });

      const destinationPath = path.join(DATA_DIR, `h1b_datahubexport-${target.year}.csv`);
      await downloadCsv(target.url, destinationPath);

      updateRunState({
        files_downloaded: currentRun.files_downloaded + 1,
        current_stage: 'importing',
      });

      const result = await importCsvFile(destinationPath, {
        year: target.year,
        sourceUrl: target.url,
        syncRunId: currentRun.id,
      });

      updateRunState({
        files_imported: currentRun.files_imported + 1,
        records_imported: currentRun.records_imported + result.recordsImported,
      });
    }

    updateRunState({
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_stage: 'completed',
    });

    return {
      started: true,
      run: currentRun,
    };
  } catch (error) {
    updateRunState({
      status: 'failed',
      completed_at: new Date().toISOString(),
      current_stage: 'failed',
      error_message: error.message,
    });

    throw error;
  }
}

function getLastRun() {
  const db = getDb();
  return db.prepare(`
    SELECT *
    FROM data_sync_runs
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `).get();
}

function toApiRun(run) {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    trigger_source: run.trigger_source,
    status: run.status,
    years_requested: Array.isArray(run.years_requested)
      ? run.years_requested
      : String(run.years_requested || '')
          .split(',')
          .filter(Boolean)
          .map((value) => parseInt(value, 10))
          .filter((value) => Number.isInteger(value)),
    started_at: run.started_at && String(run.started_at).includes('T')
      ? run.started_at
      : new Date(run.started_at * 1000).toISOString(),
    completed_at: run.completed_at
      ? (String(run.completed_at).includes('T') ? run.completed_at : new Date(run.completed_at * 1000).toISOString())
      : null,
    files_downloaded: run.files_downloaded || 0,
    files_imported: run.files_imported || 0,
    records_imported: run.records_imported || 0,
    current_year: run.current_year || null,
    current_stage: run.current_stage || null,
    error_message: run.error_message || null,
  };
}

function getSyncStatus() {
  return toApiRun(currentRun || getLastRun());
}

function initializeScheduledSync() {
  if (!SCHEDULE_ENABLED || scheduledTask) {
    return;
  }

  scheduledTask = cron.schedule(SCHEDULE, async () => {
    try {
      await runSync({ triggerSource: 'scheduled' });
    } catch (error) {
      console.error('Scheduled USCIS sync failed:', error.message);
    }
  }, {
    scheduled: true,
  });
}

function initializeStartupSync() {
  if (!AUTO_SYNC_ON_STARTUP) {
    return;
  }

  const db = getDb();
  const { totalRecords } = db.prepare('SELECT COUNT(*) AS totalRecords FROM h1b_records').get();
  const hasDemoOnly = clearDemoDataIfNeeded();

  if (!totalRecords || hasDemoOnly) {
    runSync({ triggerSource: 'startup' }).catch((error) => {
      console.error('Startup USCIS sync failed:', error.message);
    });
  }
}

module.exports = {
  DATA_DIR,
  USCIS_CSV_URLS,
  getCsvTargets,
  getSyncStatus,
  initializeScheduledSync,
  initializeStartupSync,
  runSync,
};