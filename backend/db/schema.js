const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'h1b.db');

let db;

function hasColumn(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function ensureH1bRecordsTable() {
  const table = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'h1b_records'
  `).get();

  if (!table) {
    db.exec(`
      CREATE TABLE h1b_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employer_name TEXT NOT NULL,
        city TEXT,
        state TEXT,
        zip TEXT,
        naics_code TEXT,
        naics_description TEXT,
        year INTEGER NOT NULL,
        initial_approvals INTEGER DEFAULT 0,
        initial_denials INTEGER DEFAULT 0,
        continuing_approvals INTEGER DEFAULT 0,
        continuing_denials INTEGER DEFAULT 0,
        source_key TEXT NOT NULL UNIQUE
      )
    `);
    return;
  }

  const needsMigration = !hasColumn('h1b_records', 'source_key') || table.sql.includes('UNIQUE(employer_name, year)');
  if (!needsMigration) {
    return;
  }

  db.exec(`
    ALTER TABLE h1b_records RENAME TO h1b_records_legacy;

    CREATE TABLE h1b_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employer_name TEXT NOT NULL,
      city TEXT,
      state TEXT,
      zip TEXT,
      naics_code TEXT,
      naics_description TEXT,
      year INTEGER NOT NULL,
      initial_approvals INTEGER DEFAULT 0,
      initial_denials INTEGER DEFAULT 0,
      continuing_approvals INTEGER DEFAULT 0,
      continuing_denials INTEGER DEFAULT 0,
      source_key TEXT NOT NULL UNIQUE
    );

    INSERT INTO h1b_records (
      id, employer_name, city, state, zip, naics_code, naics_description, year,
      initial_approvals, initial_denials, continuing_approvals, continuing_denials, source_key
    )
    SELECT
      id, employer_name, city, state, zip, naics_code, naics_description, year,
      initial_approvals, initial_denials, continuing_approvals, continuing_denials,
      'legacy-' || id
    FROM h1b_records_legacy;

    DROP TABLE h1b_records_legacy;
  `);
}

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_enrichment (
      employer_name TEXT PRIMARY KEY,
      website TEXT,
      linkedin_url TEXT,
      description TEXT,
      industry TEXT,
      headquarters TEXT,
      enriched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS data_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      year INTEGER,
      records_imported INTEGER DEFAULT 0,
      imported_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS data_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_source TEXT NOT NULL,
      status TEXT NOT NULL,
      years_requested TEXT,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at INTEGER,
      files_downloaded INTEGER DEFAULT 0,
      files_imported INTEGER DEFAULT 0,
      records_imported INTEGER DEFAULT 0,
      current_year INTEGER,
      current_stage TEXT,
      error_message TEXT
    );
  `);

  ensureH1bRecordsTable();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_h1b_state ON h1b_records(state);
    CREATE INDEX IF NOT EXISTS idx_h1b_year ON h1b_records(year);
    CREATE INDEX IF NOT EXISTS idx_h1b_employer ON h1b_records(employer_name);
  `);

  ensureColumn('data_imports', 'source_url', 'TEXT');
  ensureColumn('data_imports', 'sync_run_id', 'INTEGER');
}

module.exports = { getDb };
