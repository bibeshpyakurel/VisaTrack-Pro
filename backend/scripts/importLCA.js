/**
 * DOL OFLC H-1B LCA Disclosure Data importer.
 * Uses exceljs streaming reader to handle large quarterly xlsx files (50–140MB)
 * without loading the entire file into memory.
 *
 * Source: https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY{YEAR}_Q{Q}.xlsx
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ExcelJS = require('exceljs');
const path = require('path');
const { getDb } = require('../db/schema');

// Excel serial date → ISO string (YYYY-MM-DD)
function excelDateToISO(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'string') {
    const s = val.trim().split(' ')[0];
    return s || null;
  }
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  return null;
}

// Normalize any wage value to annual USD
function toAnnual(wage, unit) {
  if (!wage || isNaN(wage)) return null;
  const w = Number(wage);
  if (w <= 0) return null;
  switch ((unit || '').trim().toLowerCase()) {
    case 'year':      case 'yr':       return Math.round(w);
    case 'hour':      case 'hr':       return Math.round(w * 2080);
    case 'month':     case 'mth':      return Math.round(w * 12);
    case 'week':      case 'wk':       return Math.round(w * 52);
    case 'bi-weekly': case 'bi-wkly':  return Math.round(w * 26);
    default:                           return Math.round(w);
  }
}

function str(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val.text) return val.text.trim() || null; // rich text
  const s = String(val).trim();
  return s === '' || s === 'null' ? null : s;
}

function num(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// Stream-parse one LCA xlsx file, yield only H-1B records
async function* streamLcaRows(xlsxPath, fiscalYear, fiscalQuarter) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(xlsxPath, {
    entries: 'emit',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
  });

  for await (const sheet of reader) {
    let headers = null;

    for await (const row of sheet) {
      const vals = row.values; // 1-indexed array from exceljs

      // First row = headers
      if (!headers) {
        headers = vals.slice(1).map(v => str(v) || '');
        continue;
      }

      const get = (col) => {
        const idx = headers.indexOf(col);
        return idx === -1 ? null : vals[idx + 1] ?? null;
      };

      // Filter to H-1B only
      const visaClass = str(get('VISA_CLASS'));
      if (visaClass !== 'H-1B') continue;

      const employerName = str(get('EMPLOYER_NAME'));
      const caseNumber   = str(get('CASE_NUMBER'));
      if (!employerName || !caseNumber) continue;

      const wageFrom = num(get('WAGE_RATE_OF_PAY_FROM'));
      const wageTo   = num(get('WAGE_RATE_OF_PAY_TO'));
      const wageUnit = str(get('WAGE_UNIT_OF_PAY'));
      const prevWage = num(get('PREVAILING_WAGE'));
      const pwUnit   = str(get('PW_UNIT_OF_PAY'));

      yield {
        case_number:            caseNumber,
        case_status:            str(get('CASE_STATUS')),
        received_date:          excelDateToISO(get('RECEIVED_DATE')),
        decision_date:          excelDateToISO(get('DECISION_DATE')),
        visa_class:             visaClass,
        job_title:              str(get('JOB_TITLE')),
        soc_code:               str(get('SOC_CODE')),
        soc_title:              str(get('SOC_TITLE')),
        naics_code:             str(get('NAICS_CODE')),
        total_workers:          num(get('TOTAL_WORKER_POSITIONS')) || 1,
        employer_name:          employerName,
        employer_city:          str(get('EMPLOYER_CITY')),
        employer_state:         str(get('EMPLOYER_STATE')),
        employer_postal_code:   str(get('EMPLOYER_POSTAL_CODE')),
        worksite_city:          str(get('WORKSITE_CITY')),
        worksite_state:         str(get('WORKSITE_STATE')),
        worksite_postal_code:   str(get('WORKSITE_POSTAL_CODE')),
        wage_from:              wageFrom,
        wage_to:                wageTo,
        wage_unit:              wageUnit,
        wage_from_annual:       toAnnual(wageFrom, wageUnit),
        wage_to_annual:         toAnnual(wageTo, wageUnit),
        prevailing_wage:        prevWage,
        prevailing_wage_annual: toAnnual(prevWage, pwUnit),
        pw_unit:                pwUnit,
        pw_wage_level:          str(get('PW_WAGE_LEVEL')),
        begin_date:             excelDateToISO(get('BEGIN_DATE')),
        end_date:               excelDateToISO(get('END_DATE')),
        fiscal_year:            fiscalYear,
        fiscal_quarter:         fiscalQuarter,
      };
    }

    break; // Only process the first sheet
  }
}

async function importLcaFile(xlsxPath, options = {}) {
  const db = options.db || getDb();
  const { fiscalYear, fiscalQuarter } = options;
  if (!fiscalYear || !fiscalQuarter) throw new Error('fiscalYear and fiscalQuarter are required');

  console.log(`Parsing ${path.basename(xlsxPath)} (streaming)...`);

  const insert = db.prepare(`
    INSERT INTO lca_records (
      case_number, case_status, received_date, decision_date, visa_class,
      job_title, soc_code, soc_title, naics_code, total_workers,
      employer_name, employer_city, employer_state, employer_postal_code,
      worksite_city, worksite_state, worksite_postal_code,
      wage_from, wage_to, wage_unit, wage_from_annual, wage_to_annual,
      prevailing_wage, prevailing_wage_annual, pw_unit, pw_wage_level,
      begin_date, end_date, fiscal_year, fiscal_quarter
    ) VALUES (
      @case_number, @case_status, @received_date, @decision_date, @visa_class,
      @job_title, @soc_code, @soc_title, @naics_code, @total_workers,
      @employer_name, @employer_city, @employer_state, @employer_postal_code,
      @worksite_city, @worksite_state, @worksite_postal_code,
      @wage_from, @wage_to, @wage_unit, @wage_from_annual, @wage_to_annual,
      @prevailing_wage, @prevailing_wage_annual, @pw_unit, @pw_wage_level,
      @begin_date, @end_date, @fiscal_year, @fiscal_quarter
    )
    ON CONFLICT(case_number) DO UPDATE SET
      case_status            = excluded.case_status,
      job_title              = excluded.job_title,
      wage_from              = excluded.wage_from,
      wage_to                = excluded.wage_to,
      wage_unit              = excluded.wage_unit,
      wage_from_annual       = excluded.wage_from_annual,
      wage_to_annual         = excluded.wage_to_annual,
      prevailing_wage        = excluded.prevailing_wage,
      prevailing_wage_annual = excluded.prevailing_wage_annual,
      pw_wage_level          = excluded.pw_wage_level
  `);

  // Clear existing data for this FY+Q before re-importing
  db.prepare('DELETE FROM lca_records WHERE fiscal_year = ? AND fiscal_quarter = ?')
    .run(fiscalYear, fiscalQuarter);

  // Batch inserts in transactions of 1000 rows for performance
  const BATCH = 1000;
  let batch = [];
  let totalInserted = 0;

  const flush = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
    return rows.length;
  });

  for await (const record of streamLcaRows(xlsxPath, fiscalYear, fiscalQuarter)) {
    batch.push(record);
    if (batch.length >= BATCH) {
      totalInserted += flush(batch);
      batch = [];
      if (totalInserted % 10000 === 0) {
        process.stdout.write(`  ${totalInserted.toLocaleString()} records...\r`);
      }
    }
  }

  if (batch.length) totalInserted += flush(batch);

  console.log(`  Imported ${totalInserted.toLocaleString()} H-1B LCA records for FY${fiscalYear} Q${fiscalQuarter}`);
  return { fiscalYear, fiscalQuarter, recordsImported: totalInserted };
}

module.exports = { importLcaFile, streamLcaRows };
