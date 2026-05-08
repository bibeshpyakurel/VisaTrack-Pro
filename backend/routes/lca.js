const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { runLcaSync, getLcaSyncStatus, getLcaRecordCount } = require('../services/lcaSync');

// Simple cache — 1 hour TTL
const cache = new Map();
function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3600000) return hit.value;
  const value = fn();
  cache.set(key, { value, at: Date.now() });
  return value;
}

// GET /api/lca/status
router.get('/status', (req, res) => {
  res.json({
    sync: getLcaSyncStatus(),
    record_count: getLcaRecordCount(),
  });
});

// POST /api/lca/sync — trigger a full LCA sync
router.post('/sync', async (req, res) => {
  try {
    const result = await runLcaSync({ triggerSource: 'manual' });
    res.json({ started: result.started, run: result.run });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lca/companies/:name — salary + job title data for one employer
router.get('/companies/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const db = getDb();
  const cacheKey = `lca:company:${name}`;

  const data = cached(cacheKey, () => {
    // Overall wage stats (certified only for accuracy)
    const wageStats = db.prepare(`
      SELECT
        COUNT(*)                                                    AS total_petitions,
        COUNT(CASE WHEN case_status = 'Certified' THEN 1 END)      AS certified,
        COUNT(CASE WHEN case_status = 'Denied'    THEN 1 END)      AS denied,
        COUNT(CASE WHEN case_status LIKE 'Withdrawn%' THEN 1 END)  AS withdrawn,
        MIN(wage_from_annual)                                       AS wage_min,
        MAX(COALESCE(wage_to_annual, wage_from_annual))            AS wage_max,
        ROUND(AVG(wage_from_annual))                               AS wage_avg,
        ROUND(AVG(prevailing_wage_annual))                         AS prevailing_avg
      FROM lca_records
      WHERE employer_name = ? AND wage_from_annual IS NOT NULL
        AND wage_from_annual BETWEEN 30000 AND 800000
    `).get(name);

    // Top 10 job titles
    const jobTitles = db.prepare(`
      SELECT job_title, COUNT(*) AS count
      FROM lca_records
      WHERE employer_name = ? AND job_title IS NOT NULL
      GROUP BY job_title
      ORDER BY count DESC
      LIMIT 10
    `).all(name);

    // Wage level distribution (I–IV)
    const wageLevels = db.prepare(`
      SELECT pw_wage_level AS level, COUNT(*) AS count
      FROM lca_records
      WHERE employer_name = ? AND pw_wage_level IS NOT NULL AND pw_wage_level != ''
      GROUP BY pw_wage_level
      ORDER BY pw_wage_level
    `).all(name);

    // Year-over-year wage trend
    const yearlyWage = db.prepare(`
      SELECT
        fiscal_year,
        COUNT(*)                                              AS petitions,
        ROUND(AVG(wage_from_annual))                         AS avg_wage,
        MIN(wage_from_annual)                                AS min_wage,
        MAX(COALESCE(wage_to_annual, wage_from_annual))     AS max_wage
      FROM lca_records
      WHERE employer_name = ? AND wage_from_annual IS NOT NULL
        AND wage_from_annual BETWEEN 30000 AND 800000
      GROUP BY fiscal_year
      ORDER BY fiscal_year
    `).all(name);

    // SOC breakdown (top occupations)
    const socBreakdown = db.prepare(`
      SELECT soc_title, COUNT(*) AS count
      FROM lca_records
      WHERE employer_name = ? AND soc_title IS NOT NULL
      GROUP BY soc_title
      ORDER BY count DESC
      LIMIT 8
    `).all(name);

    // Worksites used
    const worksites = db.prepare(`
      SELECT
        worksite_city   AS city,
        worksite_state  AS state,
        COUNT(*)        AS count
      FROM lca_records
      WHERE employer_name = ? AND worksite_state IS NOT NULL
      GROUP BY worksite_city, worksite_state
      ORDER BY count DESC
      LIMIT 8
    `).all(name);

    return { wage_stats: wageStats, job_titles: jobTitles, wage_levels: wageLevels, yearly_wage: yearlyWage, soc_breakdown: socBreakdown, worksites };
  });

  if (!data.wage_stats || data.wage_stats.total_petitions === 0) {
    return res.status(404).json({ error: 'No LCA data for this company' });
  }

  res.json(data);
});

// GET /api/lca/summary?fy=2024&state=CA
router.get('/summary', (req, res) => {
  const db = getDb();
  const { fy, state } = req.query;
  const cacheKey = `lca:summary:${fy || 'all'}:${state || 'all'}`;

  const data = cached(cacheKey, () => {
    const conditions = ['wage_from_annual IS NOT NULL', 'wage_from_annual BETWEEN 30000 AND 800000'];
    const params = [];
    if (fy)    { conditions.push('fiscal_year = ?');    params.push(parseInt(fy)); }
    if (state) { conditions.push('worksite_state = ?'); params.push(state.toUpperCase()); }
    const where = 'WHERE ' + conditions.join(' AND ');

    const stats = db.prepare(`
      SELECT
        COUNT(*)                                                          AS total_petitions,
        COUNT(DISTINCT employer_name)                                     AS unique_employers,
        ROUND(AVG(wage_from_annual))                                      AS avg_wage,
        ROUND(AVG(prevailing_wage_annual))                                AS avg_prevailing,
        COUNT(CASE WHEN case_status = 'Certified' THEN 1 END)            AS certified,
        COUNT(CASE WHEN case_status = 'Denied'    THEN 1 END)            AS denied,
        COUNT(CASE WHEN case_status LIKE 'Withdrawn%' THEN 1 END)        AS withdrawn,
        MIN(fiscal_year)                                                  AS min_fy,
        MAX(fiscal_year)                                                  AS max_fy
      FROM lca_records ${where}
    `).get(...params);

    return stats;
  });

  res.json(data);
});

// GET /api/lca/by-state?fy=2024
router.get('/by-state', (req, res) => {
  const db = getDb();
  const { fy } = req.query;
  const cacheKey = `lca:by-state:${fy || 'all'}`;

  const rows = cached(cacheKey, () => {
    const conditions = ['worksite_state IS NOT NULL', 'wage_from_annual IS NOT NULL', 'wage_from_annual BETWEEN 30000 AND 800000'];
    const params = [];
    if (fy) { conditions.push('fiscal_year = ?'); params.push(parseInt(fy)); }

    return db.prepare(`
      SELECT
        worksite_state                        AS state,
        COUNT(*)                              AS petitions,
        ROUND(AVG(wage_from_annual))          AS avg_wage,
        COUNT(DISTINCT employer_name)         AS employers,
        COUNT(CASE WHEN case_status = 'Certified' THEN 1 END) AS certified
      FROM lca_records
      WHERE ${conditions.join(' AND ')}
      GROUP BY worksite_state
      ORDER BY petitions DESC
    `).all(...params);
  });

  res.json({ data: rows });
});

// GET /api/lca/top-occupations?fy=2024&state=CA&limit=20
router.get('/top-occupations', (req, res) => {
  const db = getDb();
  const { fy, state, limit = 20 } = req.query;
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
  const cacheKey = `lca:top-occ:${fy || 'all'}:${state || 'all'}:${limitNum}`;

  const rows = cached(cacheKey, () => {
    const conditions = ['soc_title IS NOT NULL', 'wage_from_annual IS NOT NULL', 'wage_from_annual BETWEEN 30000 AND 800000'];
    const params = [];
    if (fy)    { conditions.push('fiscal_year = ?');    params.push(parseInt(fy)); }
    if (state) { conditions.push('worksite_state = ?'); params.push(state.toUpperCase()); }

    return db.prepare(`
      SELECT
        soc_title                              AS occupation,
        soc_code,
        COUNT(*)                              AS petitions,
        ROUND(AVG(wage_from_annual))          AS avg_wage,
        MIN(wage_from_annual)                 AS min_wage,
        MAX(COALESCE(wage_to_annual, wage_from_annual)) AS max_wage
      FROM lca_records
      WHERE ${conditions.join(' AND ')}
      GROUP BY soc_title
      HAVING petitions >= 10
      ORDER BY avg_wage DESC
      LIMIT ?
    `).all(...params, limitNum);
  });

  res.json({ data: rows });
});

// GET /api/lca/wage-levels?fy=2024&state=CA
router.get('/wage-levels', (req, res) => {
  const db = getDb();
  const { fy, state } = req.query;
  const cacheKey = `lca:wage-levels:${fy || 'all'}:${state || 'all'}`;

  const rows = cached(cacheKey, () => {
    const conditions = ['pw_wage_level IS NOT NULL', "pw_wage_level != ''"];
    const params = [];
    if (fy)    { conditions.push('fiscal_year = ?');    params.push(parseInt(fy)); }
    if (state) { conditions.push('worksite_state = ?'); params.push(state.toUpperCase()); }

    return db.prepare(`
      SELECT
        pw_wage_level                         AS level,
        COUNT(*)                              AS count,
        ROUND(AVG(wage_from_annual))          AS avg_wage
      FROM lca_records
      WHERE ${conditions.join(' AND ')}
      GROUP BY pw_wage_level
      ORDER BY pw_wage_level
    `).all(...params);
  });

  res.json({ data: rows });
});

// GET /api/lca/trends?state=CA
router.get('/trends', (req, res) => {
  const db = getDb();
  const { state } = req.query;
  const cacheKey = `lca:trends:${state || 'all'}`;

  const rows = cached(cacheKey, () => {
    const conditions = ['wage_from_annual IS NOT NULL', 'wage_from_annual BETWEEN 30000 AND 800000'];
    const params = [];
    if (state) { conditions.push('worksite_state = ?'); params.push(state.toUpperCase()); }

    return db.prepare(`
      SELECT
        fiscal_year,
        COUNT(*)                                                    AS petitions,
        ROUND(AVG(wage_from_annual))                               AS avg_wage,
        COUNT(DISTINCT employer_name)                              AS employers,
        COUNT(CASE WHEN case_status = 'Certified' THEN 1 END)     AS certified,
        COUNT(CASE WHEN case_status = 'Denied'    THEN 1 END)     AS denied
      FROM lca_records
      WHERE ${conditions.join(' AND ')}
      GROUP BY fiscal_year
      ORDER BY fiscal_year ASC
    `).all(...params);
  });

  res.json({ data: rows });
});

// GET /api/lca/top-paying?state=CA&fy=2024&limit=20
router.get('/top-paying', (req, res) => {
  const db = getDb();
  const { state, fy, limit = 20 } = req.query;
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
  const cacheKey = `lca:top-paying:${state || 'all'}:${fy || 'all'}:${limitNum}`;

  const rows = cached(cacheKey, () => {
    const conditions = ['wage_from_annual IS NOT NULL', 'wage_from_annual BETWEEN 30000 AND 800000'];
    const params = [];
    if (state) { conditions.push('worksite_state = ?'); params.push(state.toUpperCase()); }
    if (fy)    { conditions.push('fiscal_year = ?');    params.push(parseInt(fy)); }

    return db.prepare(`
      SELECT
        employer_name,
        worksite_state                        AS state,
        COUNT(*)                              AS petitions,
        ROUND(AVG(wage_from_annual))          AS avg_wage,
        MIN(wage_from_annual)                 AS min_wage,
        MAX(COALESCE(wage_to_annual, wage_from_annual)) AS max_wage
      FROM lca_records
      WHERE ${conditions.join(' AND ')}
      GROUP BY employer_name
      HAVING petitions >= 3
      ORDER BY avg_wage DESC
      LIMIT ?
    `).all(...params, limitNum);
  });

  res.json({ data: rows });
});

module.exports = router;
