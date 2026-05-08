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

  // FTS5 full-text search on employer names
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS employer_fts USING fts5(
      employer_name,
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS h1b_fts_ai
    AFTER INSERT ON h1b_records BEGIN
      INSERT INTO employer_fts(rowid, employer_name) VALUES (new.id, new.employer_name);
    END;

    CREATE TRIGGER IF NOT EXISTS h1b_fts_ad
    AFTER DELETE ON h1b_records BEGIN
      INSERT INTO employer_fts(employer_fts, rowid, employer_name) VALUES ('delete', old.id, old.employer_name);
    END;
  `);

  // Populate FTS if empty (first run or after migration)
  const { fts_count } = db.prepare('SELECT COUNT(*) AS fts_count FROM employer_fts').get();
  const { rec_count } = db.prepare('SELECT COUNT(*) AS rec_count FROM h1b_records').get();
  if (fts_count === 0 && rec_count > 0) {
    db.exec(`INSERT INTO employer_fts(rowid, employer_name) SELECT id, employer_name FROM h1b_records`);
  }

  ensureColumn('data_imports', 'source_url', 'TEXT');
  ensureColumn('data_imports', 'sync_run_id', 'INTEGER');

  // DOL LCA petition-level records (salary, job title, case status)
  db.exec(`
    CREATE TABLE IF NOT EXISTS lca_records (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number          TEXT NOT NULL UNIQUE,
      case_status          TEXT,
      received_date        TEXT,
      decision_date        TEXT,
      visa_class           TEXT DEFAULT 'H-1B',
      job_title            TEXT,
      soc_code             TEXT,
      soc_title            TEXT,
      naics_code           TEXT,
      total_workers        INTEGER DEFAULT 1,
      employer_name        TEXT NOT NULL,
      employer_city        TEXT,
      employer_state       TEXT,
      employer_postal_code TEXT,
      worksite_city        TEXT,
      worksite_state       TEXT,
      worksite_postal_code TEXT,
      wage_from            REAL,
      wage_to              REAL,
      wage_unit            TEXT,
      wage_from_annual     REAL,
      wage_to_annual       REAL,
      prevailing_wage      REAL,
      prevailing_wage_annual REAL,
      pw_unit              TEXT,
      pw_wage_level        TEXT,
      begin_date           TEXT,
      end_date             TEXT,
      fiscal_year          INTEGER,
      fiscal_quarter       INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_lca_employer ON lca_records(employer_name);
    CREATE INDEX IF NOT EXISTS idx_lca_state    ON lca_records(worksite_state);
    CREATE INDEX IF NOT EXISTS idx_lca_fy       ON lca_records(fiscal_year, fiscal_quarter);
    CREATE INDEX IF NOT EXISTS idx_lca_soc      ON lca_records(soc_code);
    CREATE INDEX IF NOT EXISTS idx_lca_status   ON lca_records(case_status);

    CREATE TABLE IF NOT EXISTS lca_sync_runs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_source   TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'running',
      started_at       INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at     INTEGER,
      files_downloaded INTEGER DEFAULT 0,
      files_imported   INTEGER DEFAULT 0,
      records_imported INTEGER DEFAULT 0,
      current_file     TEXT,
      error_message    TEXT
    );
  `);
}

module.exports = { getDb };
