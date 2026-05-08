require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');
const { getDb } = require('../db/schema');
const { importLcaFile } = require('../scripts/importLCA');

// Runs at 6am on the 15th of Jan, Apr, Jul, Oct — one quarter after each DOL release
const LCA_SCHEDULE         = process.env.LCA_SYNC_SCHEDULE || '0 6 15 1,4,7,10 *';
const LCA_SCHEDULE_ENABLED = process.env.LCA_SYNC_SCHEDULE_ENABLED !== 'false';

let scheduledLcaTask = null;

const DATA_DIR = process.env.LCA_DATA_DIR || path.join(__dirname, '..', 'data', 'lca');

// FY2023 Q1 through FY2025 Q4 (unavailable quarters will 404 and be skipped)
const LCA_TARGETS = (() => {
  const targets = [];
  for (let fy = 2023; fy <= 2025; fy++) {
    for (let q = 1; q <= 4; q++) {
      targets.push({
        fy,
        quarter: q,
        url: `https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY${fy}_Q${q}.xlsx`,
        filename: `LCA_Disclosure_Data_FY${fy}_Q${q}.xlsx`,
      });
    }
  }
  return targets;
})();

let currentLcaRun = null;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function downloadFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(destPath, buffer);
}

function createLcaRun(db, triggerSource) {
  const result = db.prepare(`
    INSERT INTO lca_sync_runs (trigger_source, status)
    VALUES (?, 'running')
  `).run(triggerSource);

  currentLcaRun = {
    id: result.lastInsertRowid,
    status: 'running',
    files_downloaded: 0,
    files_imported: 0,
    records_imported: 0,
    current_file: null,
    error_message: null,
  };
  return currentLcaRun;
}

function updateLcaRun(db, partial) {
  if (!currentLcaRun) return;
  currentLcaRun = { ...currentLcaRun, ...partial };
  db.prepare(`
    UPDATE lca_sync_runs SET
      status           = ?,
      completed_at     = ?,
      files_downloaded = ?,
      files_imported   = ?,
      records_imported = ?,
      current_file     = ?,
      error_message    = ?
    WHERE id = ?
  `).run(
    currentLcaRun.status,
    currentLcaRun.completed_at ? Math.floor(new Date(currentLcaRun.completed_at).getTime() / 1000) : null,
    currentLcaRun.files_downloaded,
    currentLcaRun.files_imported,
    currentLcaRun.records_imported,
    currentLcaRun.current_file,
    currentLcaRun.error_message,
    currentLcaRun.id,
  );
}

async function runLcaSync({ triggerSource = 'manual' } = {}) {
  if (currentLcaRun?.status === 'running') {
    return { started: false, run: currentLcaRun };
  }

  ensureDataDir();
  const db = getDb();
  const run = createLcaRun(db, triggerSource);

  try {
    for (const target of LCA_TARGETS) {
      const destPath = path.join(DATA_DIR, target.filename);
      updateLcaRun(db, { current_file: target.filename });

      // Download
      try {
        console.log(`Downloading ${target.filename}...`);
        await downloadFile(target.url, destPath);
        updateLcaRun(db, { files_downloaded: currentLcaRun.files_downloaded + 1 });
      } catch (err) {
        console.warn(`Skipping ${target.filename}: ${err.message}`);
        continue; // Quarter not published yet — skip
      }

      // Import
      try {
        const result = await importLcaFile(destPath, {
          fiscalYear: target.fy,
          fiscalQuarter: target.quarter,
          db,
        });
        updateLcaRun(db, {
          files_imported: currentLcaRun.files_imported + 1,
          records_imported: currentLcaRun.records_imported + result.recordsImported,
        });
      } catch (err) {
        console.error(`Import failed for ${target.filename}: ${err.message}`);
        // Don't abort the whole sync for a single bad file
      }

      // Remove downloaded file to save disk space after import
      fs.unlink(destPath, () => {});
    }

    updateLcaRun(db, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_file: null,
    });

    console.log(`LCA sync complete: ${currentLcaRun.records_imported.toLocaleString()} records across ${currentLcaRun.files_imported} files`);
    return { started: true, run: currentLcaRun };

  } catch (err) {
    updateLcaRun(db, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: err.message,
    });
    throw err;
  }
}

function getLcaSyncStatus() {
  if (currentLcaRun) return currentLcaRun;
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM lca_sync_runs ORDER BY started_at DESC, id DESC LIMIT 1
  `).get();
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    trigger_source: row.trigger_source,
    started_at: new Date(row.started_at * 1000).toISOString(),
    completed_at: row.completed_at ? new Date(row.completed_at * 1000).toISOString() : null,
    files_downloaded: row.files_downloaded || 0,
    files_imported: row.files_imported || 0,
    records_imported: row.records_imported || 0,
    current_file: row.current_file || null,
    error_message: row.error_message || null,
  };
}

function getLcaRecordCount() {
  const db = getDb();
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM lca_records').get();
  return count;
}

function initializeLcaScheduledSync() {
  if (!LCA_SCHEDULE_ENABLED || scheduledLcaTask) return;

  scheduledLcaTask = cron.schedule(LCA_SCHEDULE, async () => {
    console.log('Running scheduled LCA sync...');
    try {
      await runLcaSync({ triggerSource: 'scheduled' });
    } catch (err) {
      console.error('Scheduled LCA sync failed:', err.message);
    }
  }, { scheduled: true });

  console.log(`LCA sync scheduled: ${LCA_SCHEDULE} (Jan/Apr/Jul/Oct 15 at 6am)`);
}

module.exports = { runLcaSync, getLcaSyncStatus, getLcaRecordCount, LCA_TARGETS, initializeLcaScheduledSync };
