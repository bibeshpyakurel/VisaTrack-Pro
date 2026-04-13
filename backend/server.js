require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { getDb } = require('./db/schema');
const { getSyncStatus, initializeScheduledSync, initializeStartupSync } = require('./services/dataSync');

const companiesRouter = require('./routes/companies');
const statesRouter = require('./routes/states');
const enrichRouter = require('./routes/enrich');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// General rate limit — 200 requests/minute per IP (covers companies + states)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

// Strict rate limit for AI enrichment — 20 requests/minute per IP
const enrichLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many enrichment requests, please slow down.' },
});

// Initialize DB on startup
getDb();

// Apply general limiter to all /api routes
app.use('/api', generalLimiter);

// Routes
app.use('/api/companies', companiesRouter);
app.use('/api/states', statesRouter);
app.use('/api/enrich', enrichLimiter, enrichRouter);
app.use('/api/admin', adminRouter);

// GET /api/industries — distinct NAICS industry descriptions for filter dropdown
app.get('/api/industries', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT naics_description AS industry, COUNT(DISTINCT employer_name) AS company_count
    FROM h1b_records
    WHERE naics_description IS NOT NULL AND naics_description != ''
    GROUP BY naics_description
    ORDER BY company_count DESC
    LIMIT 50
  `).all();
  res.json({ data: rows });
});

// GET /api/health
app.get('/api/health', (req, res) => {
  const db = getDb();
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM h1b_records').get();
  const { company_count } = db.prepare('SELECT COUNT(*) AS company_count FROM company_enrichment').get();
  const years = db.prepare('SELECT DISTINCT year FROM h1b_records ORDER BY year').all().map(r => r.year);
  const lastImport = db.prepare(
    'SELECT filename, records_imported, imported_at FROM data_imports ORDER BY imported_at DESC LIMIT 1'
  ).get();
  const syncStatus = getSyncStatus();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    records: count,
    enriched_companies: company_count,
    years_available: years,
    last_import: lastImport
      ? {
          filename: lastImport.filename,
          records: lastImport.records_imported,
          at: new Date(lastImport.imported_at * 1000).toISOString(),
        }
      : null,
    sync: syncStatus,
  });
});

// GET /api — API documentation
app.get('/api', (req, res) => {
  res.json({
    name: 'VisaTrack Pro API',
    version: '1.0.0',
    description: 'H-1B employer intelligence powered by USCIS data and AI',
    endpoints: [
      { method: 'GET', path: '/api/companies', description: 'List companies. Params: state, year, search, industry, page, limit, sort, order' },
      { method: 'GET', path: '/api/companies/:name', description: 'Full H-1B history + enrichment for one company' },
      { method: 'GET', path: '/api/states', description: 'Aggregated stats for all states. Param: year' },
      { method: 'GET', path: '/api/states/:code', description: 'Stats + top employers + yearly trend for one state' },
      { method: 'GET', path: '/api/industries', description: 'Distinct NAICS industry descriptions with company counts' },
      { method: 'GET', path: '/api/enrich/:name', description: 'AI lookup: website + LinkedIn. Cached 30 days.' },
      { method: 'POST', path: '/api/enrich/batch', description: 'Enrich up to 10 companies. Body: { companies: [...] }' },
      { method: 'GET', path: '/api/health', description: 'Health check — status, record count, last import, available years' },
      { method: 'GET', path: '/api/admin/refresh', description: 'Current USCIS sync status and progress.' },
      { method: 'POST', path: '/api/admin/refresh', description: 'Trigger a USCIS data refresh. Optional body: { years: [2022, 2023] }' },
    ],
  });
});

app.listen(PORT, () => {
  initializeScheduledSync();
  initializeStartupSync();
  console.log(`VisaTrack Pro backend running on http://localhost:${PORT}`);
  console.log(`API docs: http://localhost:${PORT}/api`);
});
