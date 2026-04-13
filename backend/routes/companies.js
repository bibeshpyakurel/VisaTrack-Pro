const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

// GET /api/companies
// Params: state, year, search, industry, page, limit, sort, order
router.get('/', (req, res) => {
  const db = getDb();
  const {
    state,
    year,
    search,
    industry,
    page = 1,
    limit = 25,
    sort = 'total_approvals',
    order = 'desc',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const allowedSorts = ['total_approvals', 'total_denials', 'initial_approvals', 'initial_denials', 'employer_name', 'year'];
  const allowedOrders = ['asc', 'desc'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'total_approvals';
  const orderDir = allowedOrders.includes(order.toLowerCase()) ? order.toUpperCase() : 'DESC';

  const conditions = [];
  const params = [];

  if (state) {
    conditions.push('r.state = ?');
    params.push(state.toUpperCase());
  }
  if (year) {
    conditions.push('r.year = ?');
    params.push(parseInt(year));
  }
  if (search) {
    conditions.push('r.employer_name LIKE ?');
    params.push(`%${search}%`);
  }
  if (industry) {
    conditions.push('r.naics_description = ?');
    params.push(industry);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortExpr = sortCol === 'employer_name' ? 'r.employer_name' :
    sortCol === 'total_approvals' ? '(SUM(r.initial_approvals) + SUM(r.continuing_approvals))' :
    sortCol === 'total_denials' ? '(SUM(r.initial_denials) + SUM(r.continuing_denials))' :
    sortCol === 'initial_approvals' ? 'SUM(r.initial_approvals)' :
    'SUM(r.initial_denials)';

  const query = `
    SELECT
      r.employer_name,
      CASE WHEN COUNT(DISTINCT r.state) = 1 THEN MAX(r.state) ELSE NULL END AS state,
      CASE WHEN COUNT(DISTINCT r.city) = 1 THEN MAX(r.city) ELSE NULL END AS city,
      MAX(r.naics_description) AS naics_description,
      MIN(r.year) AS first_year,
      MAX(r.year) AS last_year,
      COUNT(DISTINCT r.state) AS states_active,
      SUM(r.initial_approvals) + SUM(r.continuing_approvals) AS total_approvals,
      SUM(r.initial_denials) + SUM(r.continuing_denials) AS total_denials,
      SUM(r.initial_approvals) AS initial_approvals,
      SUM(r.initial_denials) AS initial_denials,
      COUNT(DISTINCT r.year) AS years_active,
      e.website,
      e.linkedin_url,
      e.industry
    FROM h1b_records r
    LEFT JOIN company_enrichment e ON e.employer_name = r.employer_name
    ${where}
    GROUP BY r.employer_name
    ORDER BY ${sortExpr} ${orderDir}
    LIMIT ? OFFSET ?
  `;
  const countQuery = `
    SELECT COUNT(DISTINCT r.employer_name) AS total
    FROM h1b_records r
    ${where}
  `;

  const companies = db.prepare(query).all(...params, limitNum, offset);
  const { total } = db.prepare(countQuery).get(...params);

  res.json({
    data: companies,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

// GET /api/companies/:name
router.get('/:name', (req, res) => {
  const db = getDb();
  const name = decodeURIComponent(req.params.name);

  const enrichment = db.prepare(
    'SELECT * FROM company_enrichment WHERE employer_name = ?'
  ).get(name);

  const history = db.prepare(`
    SELECT
      year,
      SUM(initial_approvals) AS initial_approvals,
      SUM(initial_denials) AS initial_denials,
      SUM(continuing_approvals) AS continuing_approvals,
      SUM(continuing_denials) AS continuing_denials,
      SUM(initial_approvals + continuing_approvals) AS total_approvals,
      SUM(initial_denials + continuing_denials) AS total_denials,
      CASE WHEN COUNT(DISTINCT city) = 1 THEN MAX(city) ELSE NULL END AS city,
      CASE WHEN COUNT(DISTINCT state) = 1 THEN MAX(state) ELSE NULL END AS state,
      CASE WHEN COUNT(DISTINCT zip) = 1 THEN MAX(zip) ELSE NULL END AS zip,
      MAX(naics_code) AS naics_code,
      MAX(naics_description) AS naics_description
    FROM h1b_records
    WHERE employer_name = ?
    GROUP BY year
    ORDER BY year ASC
  `).all(name);

  if (!history.length) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const totals = history.reduce(
    (acc, row) => ({
      total_approvals: acc.total_approvals + row.total_approvals,
      total_denials: acc.total_denials + row.total_denials,
    }),
    { total_approvals: 0, total_denials: 0 }
  );

  res.json({
    employer_name: name,
    ...totals,
    years_active: history.length,
    enrichment: enrichment || null,
    history,
  });
});

module.exports = router;
