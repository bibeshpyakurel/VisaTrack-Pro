const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

// Simple in-memory cache — invalidated on server restart (which happens after sync)
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;
  const value = fn();
  cache.set(key, { value, at: Date.now() });
  return value;
}

// GET /api/states?year=2023
router.get('/', (req, res) => {
  const db = getDb();
  const { year } = req.query;
  const cacheKey = `states:${year || 'all'}`;

  const rows = cached(cacheKey, () => {
    const conditions = year ? 'WHERE year = ?' : '';
    const params = year ? [parseInt(year)] : [];
    return db.prepare(`
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
  });

  res.json({ data: rows });
});

// GET /api/states/national-trend
router.get('/national-trend', (req, res) => {
  const db = getDb();
  const rows = cached('national-trend', () =>
    db.prepare(`
      SELECT
        year,
        SUM(initial_approvals + continuing_approvals) AS total_approvals,
        SUM(initial_denials + continuing_denials) AS total_denials,
        COUNT(DISTINCT employer_name) AS employer_count
      FROM h1b_records
      GROUP BY year
      ORDER BY year ASC
    `).all()
  );
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

  const topIndustries = db.prepare(`
    SELECT
      naics_description AS industry,
      SUM(initial_approvals + continuing_approvals) AS total_approvals,
      COUNT(DISTINCT employer_name) AS employer_count
    FROM h1b_records
    WHERE state = ? AND naics_description IS NOT NULL AND naics_description != ''
    GROUP BY naics_description
    ORDER BY total_approvals DESC
    LIMIT 8
  `).all(code);

  res.json({
    state: code,
    summary,
    top_employers: topEmployers,
    yearly_trend: yearlyTrend,
    top_industries: topIndustries,
  });
});

module.exports = router;
