const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const { getDb } = require('../db/schema');

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let openai;
function getClient() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

async function enrichCompany(name) {
  const db = getDb();
  const now = Date.now();

  // Check cache
  const cached = db.prepare(
    'SELECT * FROM company_enrichment WHERE employer_name = ?'
  ).get(name);

  if (cached && now - cached.enriched_at * 1000 < CACHE_TTL_MS) {
    return { ...cached, cached: true };
  }

  // Fetch from OpenAI
  const client = getClient();
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [
      {
        role: 'system',
        content: 'You are a business research assistant. Given a company name, return factual business information in JSON. Only return the JSON object, no prose.',
      },
      {
        role: 'user',
        content: `Research this company and return a JSON object with these fields:
- website: (official company website URL, or null)
- linkedin_url: (LinkedIn company page URL, or null)
- description: (1-2 sentence company description, or null)
- industry: (industry/sector, e.g. "Technology", "Healthcare", "Finance", or null)
- headquarters: (city, state or city, country, or null)

Company name: "${name}"

Return ONLY valid JSON.`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  let enriched = { website: null, linkedin_url: null, description: null, industry: null, headquarters: null };
  try {
    const text = response.choices[0].message.content.trim();
    enriched = { ...enriched, ...JSON.parse(text) };
  } catch {
    // Keep defaults on parse error
  }

  // Upsert cache
  db.prepare(`
    INSERT INTO company_enrichment (employer_name, website, linkedin_url, description, industry, headquarters, enriched_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(employer_name) DO UPDATE SET
      website = excluded.website,
      linkedin_url = excluded.linkedin_url,
      description = excluded.description,
      industry = excluded.industry,
      headquarters = excluded.headquarters,
      enriched_at = excluded.enriched_at
  `).run(name, enriched.website, enriched.linkedin_url, enriched.description, enriched.industry, enriched.headquarters);

  return { employer_name: name, ...enriched, cached: false };
}

// GET /api/enrich/:name
router.get('/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'Company name too short' });
  }

  try {
    const result = await enrichCompany(name);
    res.json(result);
  } catch (err) {
    console.error('Enrichment error:', err.message);
    res.status(500).json({ error: 'Enrichment failed', detail: err.message });
  }
});

// POST /api/enrich/batch
// Body: { companies: ["Google LLC", "Meta Platforms Inc", ...] }
router.post('/batch', async (req, res) => {
  const { companies } = req.body;
  if (!Array.isArray(companies) || companies.length === 0) {
    return res.status(400).json({ error: 'companies must be a non-empty array' });
  }
  if (companies.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 companies per batch' });
  }

  const results = [];
  for (const name of companies) {
    try {
      const result = await enrichCompany(String(name).trim());
      results.push(result);
    } catch (err) {
      results.push({ employer_name: name, error: err.message });
    }
  }

  res.json({ results });
});

module.exports = router;
