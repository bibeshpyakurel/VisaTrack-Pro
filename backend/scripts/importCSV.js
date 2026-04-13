/**
 * CSV Importer for USCIS H-1B Employer Data Hub downloads.
 *
 * Usage:
 *   node scripts/importCSV.js <path-to-csv> [fiscal-year]
 *
 * The USCIS CSV has columns like:
 *   Employer (or Employer Name), Initial Approvals, Initial Denials,
 *   Continuing Approvals, Continuing Denials, NAICS, Tax ID,
 *   State, City, ZIP, Fiscal Year
 *
 * Download from: https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { getDb } = require('../db/schema');

// Normalize column names from USCIS CSV variants
function normalize(headers) {
  return headers.map(h => h.trim().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  );
}

function getVal(row, headers, ...candidates) {
  for (const c of candidates) {
    const idx = headers.indexOf(c);
    if (idx !== -1 && row[idx] !== undefined) return row[idx];
  }
  return null;
}

function toInt(val) {
  const n = parseInt(String(val || '0').replace(/,/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function buildSourceKey(record) {
  return [
    record.year,
    record.employer_name,
    record.city,
    record.state,
    record.zip,
    record.naics_code,
    record.naics_description,
    record.initial_approvals,
    record.initial_denials,
    record.continuing_approvals,
    record.continuing_denials,
  ].join('|');
}

async function parseCsvFile(csvPath, yearArg = null) {
  const records = [];
  const parser = fs
    .createReadStream(csvPath)
    .pipe(parse({ relax_column_count: true, skip_empty_lines: true, trim: true }));

  let headers = null;
  let rowCount = 0;
  let detectedYear = yearArg;

  for await (const row of parser) {
    if (!headers) {
      headers = normalize(row);
      continue;
    }

    const year = yearArg || toInt(getVal(row, headers, 'fiscal_year', 'year', 'fy'));
    const name = (getVal(row, headers, 'employer', 'employer_name', 'company_name') || '').trim();

    if (!name || !year) continue;

  detectedYear = detectedYear || year;

    records.push({
      employer_name: name,
      city: (getVal(row, headers, 'city') || '').trim(),
      state: (getVal(row, headers, 'state') || '').trim().toUpperCase(),
      zip: (getVal(row, headers, 'zip', 'zip_code') || '').trim(),
      naics_code: (getVal(row, headers, 'naics', 'naics_code') || '').trim(),
      naics_description: (getVal(row, headers, 'naics_us_title', 'naics_description', 'industry') || '').trim(),
      year,
      initial_approvals: toInt(getVal(row, headers, 'initial_approvals', 'initial_approval')),
      initial_denials: toInt(getVal(row, headers, 'initial_denials', 'initial_denial')),
      continuing_approvals: toInt(getVal(row, headers, 'continuing_approvals', 'continuing_approval')),
      continuing_denials: toInt(getVal(row, headers, 'continuing_denials', 'continuing_denial')),
      source_key: '',
    });
    records[records.length - 1].source_key = buildSourceKey(records[records.length - 1]);
    rowCount++;
  }

  return { records, rowCount, detectedYear };
}

function upsertRecords(db, records) {
  if (!records.length) {
    throw new Error('No importable USCIS rows were found in the CSV file.');
  }

  const yearsInFile = [...new Set(records.map((record) => record.year))];
  const insert = db.prepare(`
    INSERT INTO h1b_records
      (employer_name, city, state, zip, naics_code, naics_description, year,
       initial_approvals, initial_denials, continuing_approvals, continuing_denials, source_key)
    VALUES
      (@employer_name, @city, @state, @zip, @naics_code, @naics_description, @year,
       @initial_approvals, @initial_denials, @continuing_approvals, @continuing_denials, @source_key)
    ON CONFLICT(source_key) DO UPDATE SET
      city = excluded.city,
      state = excluded.state,
      zip = excluded.zip,
      naics_code = excluded.naics_code,
      naics_description = excluded.naics_description,
      initial_approvals = excluded.initial_approvals,
      initial_denials = excluded.initial_denials,
      continuing_approvals = excluded.continuing_approvals,
      continuing_denials = excluded.continuing_denials
  `);

  const insertMany = db.transaction((rows) => {
    const deleteByYear = db.prepare('DELETE FROM h1b_records WHERE year = ?');
    let inserted = 0;

    for (const year of yearsInFile) {
      deleteByYear.run(year);
    }

    for (const row of rows) {
      insert.run(row);
      inserted++;
    }
    return inserted;
  });

  return insertMany(records);
}

function logImport(db, {
  filename,
  year,
  recordsImported,
  sourceUrl = null,
  syncRunId = null,
}) {
  db.prepare(`
    INSERT INTO data_imports (filename, year, records_imported, source_url, sync_run_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(filename, year, recordsImported, sourceUrl, syncRunId);
}

async function importCsvFile(csvPath, options = {}) {
  const db = options.db || getDb();
  const yearArg = options.year || null;
  const { records, rowCount, detectedYear } = await parseCsvFile(csvPath, yearArg);

  console.log(`Parsed ${rowCount} rows. Inserting into DB...`);

  const inserted = upsertRecords(db, records);
  const importYear = detectedYear || yearArg;

  logImport(db, {
    filename: options.filename || path.basename(csvPath),
    year: importYear,
    recordsImported: inserted,
    sourceUrl: options.sourceUrl || null,
    syncRunId: options.syncRunId || null,
  });

  console.log(`Done! Imported ${inserted} records from ${path.basename(csvPath)}`);

  return {
    filename: options.filename || path.basename(csvPath),
    year: importYear,
    parsedRows: rowCount,
    recordsImported: inserted,
  };
}

async function runFromCli() {
  const csvPath = process.argv[2];
  const yearArg = process.argv[3] ? parseInt(process.argv[3], 10) : null;

  if (!csvPath) {
    console.error('Usage: node scripts/importCSV.js <path-to-csv> [fiscal-year]');
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  await importCsvFile(csvPath, { year: yearArg, db: getDb() });
}

if (require.main === module) {
  runFromCli().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}

module.exports = {
  importCsvFile,
  parseCsvFile,
  upsertRecords,
  buildSourceKey,
  normalize,
  getVal,
  toInt,
};
