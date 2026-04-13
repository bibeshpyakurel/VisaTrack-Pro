const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

// GET /api/states?year=2023
router.get('/', (req, res) => {
  const db = getDb();
  const { year } = req.query;

  const conditions = year ? 'WHERE year = ?' : '';
  const params = year ? [parseInt(year)] : [];

  const rows = db.prepare(`
    SELECT
      state,
      SUM(initial_approvals + continuing_approvals) AS total_approvals,
      SUM(initial_denials + continuing_denials) AS total_denials,
      COUNT(DISTINCT employer_name) AS employer_count,
      COUNT(DISTINCT year) AS years_with_data
    FROM h1b_records
    ${conditions}
    GROUP BY state
    ORDER BY total_approvals DESC
  `).all(...params);

  res.json({ data: rows });
});

// GET /api/states/:code
router.get('/:code', (req, res) => {
  const db = getDb();
  const code = req.params.code.toUpperCase();
  const { year } = req.query;

  const yearCondition = year ? 'AND year = ?' : '';
  const yearParams = year ? [parseInt(year)] : [];

  const summary = db.prepare(`
    SELECT
      state,
      SUM(initial_approvals + continuing_approvals) AS total_approvals,
      SUM(initial_denials + continuing_denials) AS total_denials,
      COUNT(DISTINCT employer_name) AS employer_count
    FROM h1b_records
    WHERE state = ? ${yearCondition}
    GROUP BY state
  `).get(code, ...yearParams);

  if (!summary) {
    return res.status(404).json({ error: `No data for state: ${code}` });
  }

  const topEmployers = db.prepare(`
    SELECT
      employer_name,
      CASE WHEN COUNT(DISTINCT city) = 1 THEN MAX(city) ELSE NULL END AS city,
      SUM(initial_approvals + continuing_approvals) AS total_approvals,
      SUM(initial_denials + continuing_denials) AS total_denials
    FROM h1b_records
    WHERE state = ? ${yearCondition}
    GROUP BY employer_name
    ORDER BY total_approvals DESC
    LIMIT 20
  `).all(code, ...yearParams);

  const yearlyTrend = db.prepare(`
    SELECT
      year,
      SUM(initial_approvals + continuing_approvals) AS total_approvals,
      SUM(initial_denials + continuing_denials) AS total_denials,
      COUNT(DISTINCT employer_name) AS employer_count
    FROM h1b_records
    WHERE state = ?
    GROUP BY year
    ORDER BY year ASC
  `).all(code);

  res.json({
    state: code,
    summary,
    top_employers: topEmployers,
    yearly_trend: yearlyTrend,
  });
});

module.exports = router;
