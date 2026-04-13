/**
 * Seeds the database with realistic demo H-1B data so the app works
 * immediately without downloading USCIS CSV files.
 *
 * Usage: node scripts/seedDemo.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getDb } = require('../db/schema');

const db = getDb();

const companies = [
  { name: 'AMAZON WEB SERVICES INC', city: 'SEATTLE', state: 'WA', naics: '541512', naicsDesc: 'Computer Systems Design Services' },
  { name: 'GOOGLE LLC', city: 'MOUNTAIN VIEW', state: 'CA', naics: '541512', naicsDesc: 'Computer Systems Design Services' },
  { name: 'META PLATFORMS INC', city: 'MENLO PARK', state: 'CA', naics: '519130', naicsDesc: 'Internet Publishing and Broadcasting' },
  { name: 'MICROSOFT CORPORATION', city: 'REDMOND', state: 'WA', naics: '541511', naicsDesc: 'Custom Computer Programming Services' },
  { name: 'APPLE INC', city: 'CUPERTINO', state: 'CA', naics: '334220', naicsDesc: 'Radio and Television Broadcasting Equipment' },
  { name: 'SALESFORCE INC', city: 'SAN FRANCISCO', state: 'CA', naics: '511210', naicsDesc: 'Software Publishers' },
  { name: 'TATA CONSULTANCY SERVICES LIMITED', city: 'NEW YORK', state: 'NY', naics: '541512', naicsDesc: 'Computer Systems Design Services' },
  { name: 'INFOSYS BPM LIMITED', city: 'PLANO', state: 'TX', naics: '541512', naicsDesc: 'Computer Systems Design Services' },
  { name: 'WIPRO LIMITED', city: 'EAST BRUNSWICK', state: 'NJ', naics: '541512', naicsDesc: 'Computer Systems Design Services' },
  { name: 'COGNIZANT TECHNOLOGY SOLUTIONS US CORP', city: 'TEANECK', state: 'NJ', naics: '541512', naicsDesc: 'Computer Systems Design Services' },
  { name: 'DELOITTE CONSULTING LLP', city: 'NEW YORK', state: 'NY', naics: '541611', naicsDesc: 'Administrative Management and General Management Consulting Services' },
  { name: 'ERNST & YOUNG LLP', city: 'NEW YORK', state: 'NY', naics: '541211', naicsDesc: 'Offices of Certified Public Accountants' },
  { name: 'JPMORGAN CHASE & CO', city: 'NEW YORK', state: 'NY', naics: '522110', naicsDesc: 'Commercial Banking' },
  { name: 'GOLDMAN SACHS & CO LLC', city: 'NEW YORK', state: 'NY', naics: '523110', naicsDesc: 'Investment Banking and Securities Dealing' },
  { name: 'NETFLIX INC', city: 'LOS GATOS', state: 'CA', naics: '519130', naicsDesc: 'Internet Publishing and Broadcasting' },
  { name: 'UBER TECHNOLOGIES INC', city: 'SAN FRANCISCO', state: 'CA', naics: '485310', naicsDesc: 'Taxi Service' },
  { name: 'AIRBNB INC', city: 'SAN FRANCISCO', state: 'CA', naics: '561510', naicsDesc: 'Travel Agencies' },
  { name: 'TWITTER INC', city: 'SAN FRANCISCO', state: 'CA', naics: '519130', naicsDesc: 'Internet Publishing and Broadcasting' },
  { name: 'ORACLE AMERICA INC', city: 'AUSTIN', state: 'TX', naics: '511210', naicsDesc: 'Software Publishers' },
  { name: 'INTEL CORPORATION', city: 'SANTA CLARA', state: 'CA', naics: '334413', naicsDesc: 'Semiconductor and Related Device Manufacturing' },
  { name: 'QUALCOMM TECHNOLOGIES INC', city: 'SAN DIEGO', state: 'CA', naics: '334413', naicsDesc: 'Semiconductor and Related Device Manufacturing' },
  { name: 'ADOBE INC', city: 'SAN JOSE', state: 'CA', naics: '511210', naicsDesc: 'Software Publishers' },
  { name: 'NVIDIA CORPORATION', city: 'SANTA CLARA', state: 'CA', naics: '334413', naicsDesc: 'Semiconductor and Related Device Manufacturing' },
  { name: 'PAYPAL INC', city: 'SAN JOSE', state: 'CA', naics: '522320', naicsDesc: 'Financial Transactions Processing' },
  { name: 'STRIPE INC', city: 'SAN FRANCISCO', state: 'CA', naics: '522320', naicsDesc: 'Financial Transactions Processing' },
  { name: 'MAYO CLINIC', city: 'ROCHESTER', state: 'MN', naics: '621111', naicsDesc: 'Offices of Physicians' },
  { name: 'JOHNS HOPKINS UNIVERSITY', city: 'BALTIMORE', state: 'MD', naics: '611310', naicsDesc: 'Colleges, Universities, and Professional Schools' },
  { name: 'MASSACHUSETTS INSTITUTE OF TECHNOLOGY', city: 'CAMBRIDGE', state: 'MA', naics: '611310', naicsDesc: 'Colleges, Universities, and Professional Schools' },
  { name: 'STANFORD UNIVERSITY', city: 'STANFORD', state: 'CA', naics: '611310', naicsDesc: 'Colleges, Universities, and Professional Schools' },
  { name: 'UNIVERSITY OF MICHIGAN', city: 'ANN ARBOR', state: 'MI', naics: '611310', naicsDesc: 'Colleges, Universities, and Professional Schools' },
  { name: 'BOEING COMPANY', city: 'ARLINGTON', state: 'VA', naics: '336411', naicsDesc: 'Aircraft Manufacturing' },
  { name: 'LOCKHEED MARTIN CORPORATION', city: 'BETHESDA', state: 'MD', naics: '336411', naicsDesc: 'Aircraft Manufacturing' },
  { name: 'PFIZER INC', city: 'NEW YORK', state: 'NY', naics: '325412', naicsDesc: 'Pharmaceutical Preparation Manufacturing' },
  { name: 'JOHNSON & JOHNSON', city: 'NEW BRUNSWICK', state: 'NJ', naics: '325412', naicsDesc: 'Pharmaceutical Preparation Manufacturing' },
  { name: 'CISCO SYSTEMS INC', city: 'SAN JOSE', state: 'CA', naics: '334210', naicsDesc: 'Telephone Apparatus Manufacturing' },
];

const years = [2019, 2020, 2021, 2022, 2023, 2024];

function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRecord(company, year) {
  // Simulate growth trend: more approvals in recent years
  const multiplier = 1 + (year - 2019) * 0.08;
  const base = randBetween(30, 2000);
  const approvals = Math.round(base * multiplier);
  const denialRate = Math.random() * 0.15; // 0-15% denial rate

  return {
    employer_name: company.name,
    city: company.city,
    state: company.state,
    zip: '',
    naics_code: company.naics,
    naics_description: company.naicsDesc,
    year,
    initial_approvals: Math.round(approvals * 0.6),
    initial_denials: Math.round(approvals * 0.6 * denialRate),
    continuing_approvals: Math.round(approvals * 0.4),
    continuing_denials: Math.round(approvals * 0.4 * denialRate * 0.5),
  };
}

const insert = db.prepare(`
  INSERT OR REPLACE INTO h1b_records
    (employer_name, city, state, zip, naics_code, naics_description, year,
     initial_approvals, initial_denials, continuing_approvals, continuing_denials)
  VALUES
    (@employer_name, @city, @state, @zip, @naics_code, @naics_description, @year,
     @initial_approvals, @initial_denials, @continuing_approvals, @continuing_denials)
`);

const seedAll = db.transaction(() => {
  let count = 0;
  for (const company of companies) {
    for (const year of years) {
      insert.run(generateRecord(company, year));
      count++;
    }
  }
  return count;
});

const inserted = seedAll();

db.prepare(`
  INSERT INTO data_imports (filename, year, records_imported)
  VALUES ('seed_demo.js', NULL, ?)
`).run(inserted);

console.log(`Seeded ${inserted} demo records across ${companies.length} companies and ${years.length} years.`);
console.log('You can now start the server and explore the app.');
