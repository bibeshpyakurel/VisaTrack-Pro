const express = require('express');
const { getSyncStatus, runSync } = require('../services/dataSync');

const router = express.Router();

function requireAdminToken(req, res, next) {
  const configuredToken = process.env.ADMIN_API_TOKEN;

  if (!configuredToken) {
    return next();
  }

  const bearerHeader = req.headers.authorization || '';
  const bearerToken = bearerHeader.startsWith('Bearer ') ? bearerHeader.slice(7) : null;
  const headerToken = req.headers['x-admin-token'];

  if (configuredToken === bearerToken || configuredToken === headerToken) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

router.get('/refresh', (req, res) => {
  res.json({
    data: getSyncStatus(),
  });
});

router.post('/refresh', requireAdminToken, async (req, res) => {
  const requestedYears = Array.isArray(req.body?.years)
    ? req.body.years.map((value) => parseInt(value, 10)).filter((value) => Number.isInteger(value))
    : undefined;

  try {
    const result = await runSync({
      triggerSource: 'manual',
      years: requestedYears,
    });

    res.status(result.started ? 202 : 200).json({
      started: result.started,
      data: result.run,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;