import React, { useEffect, useState } from 'react';
import './ApiDocsPage.css';

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/companies',
    description: 'List companies with optional filters, sorting, and pagination.',
    params: [
      { name: 'search', type: 'string', desc: 'Filter by company name (partial match)' },
      { name: 'state', type: 'string', desc: 'Filter by 2-letter state code (e.g. CA)' },
      { name: 'year', type: 'integer', desc: 'Filter by fiscal year (e.g. 2023)' },
      { name: 'sort', type: 'string', desc: 'Sort field: total_approvals, total_denials, employer_name (default: total_approvals)' },
      { name: 'order', type: 'string', desc: 'asc or desc (default: desc)' },
      { name: 'page', type: 'integer', desc: 'Page number (default: 1)' },
      { name: 'limit', type: 'integer', desc: 'Results per page, max 100 (default: 25)' },
    ],
    example: '/api/companies?state=CA&year=2023&sort=total_approvals&page=1',
    responseNote: 'Returns { data: [...], pagination: { page, limit, total, pages } }',
  },
  {
    method: 'GET',
    path: '/api/companies/:name',
    description: 'Full H-1B petition history and AI enrichment for a single company.',
    params: [
      { name: 'name', type: 'path', desc: 'URL-encoded employer name (exact match)' },
    ],
    example: '/api/companies/GOOGLE%20LLC',
    responseNote: 'Returns employer info, total_approvals, total_denials, enrichment, and history array.',
  },
  {
    method: 'GET',
    path: '/api/states',
    description: 'Aggregated H-1B stats for all 50 states.',
    params: [
      { name: 'year', type: 'integer', desc: 'Filter to a specific fiscal year (optional)' },
    ],
    example: '/api/states?year=2023',
    responseNote: 'Returns { data: [ { state, total_approvals, total_denials, employer_count } ] }',
  },
  {
    method: 'GET',
    path: '/api/states/:code',
    description: 'Detailed stats, top employers, and yearly trend for one state.',
    params: [
      { name: 'code', type: 'path', desc: '2-letter state code (e.g. NY)' },
      { name: 'year', type: 'integer', desc: 'Optional — scope summary to one fiscal year' },
    ],
    example: '/api/states/NY',
    responseNote: 'Returns { state, summary, top_employers, yearly_trend }',
  },
  {
    method: 'GET',
    path: '/api/enrich/:name',
    description: 'Claude AI company enrichment — returns website, LinkedIn URL, industry, description. Cached 30 days.',
    params: [
      { name: 'name', type: 'path', desc: 'URL-encoded employer name' },
    ],
    example: '/api/enrich/MICROSOFT%20CORPORATION',
    responseNote: 'Returns { employer_name, website, linkedin_url, description, industry, headquarters, cached }',
  },
  {
    method: 'POST',
    path: '/api/enrich/batch',
    description: 'Enrich up to 10 companies in one call. Each company is cached individually.',
    params: [
      { name: 'companies', type: 'body (JSON)', desc: 'Array of employer name strings, max 10' },
    ],
    example: `POST /api/enrich/batch\nContent-Type: application/json\n\n{ "companies": ["GOOGLE LLC", "META PLATFORMS INC"] }`,
    responseNote: 'Returns { results: [ ...enriched company objects ] }',
  },
  {
    method: 'GET',
    path: '/api/health',
    description: 'Health check — returns service status and database statistics.',
    params: [],
    example: '/api/health',
    responseNote: 'Returns { status, timestamp, records, enriched_companies, years_available }',
  },
  {
    method: 'GET',
    path: '/api/admin/refresh',
    description: 'Returns the current USCIS refresh state, progress counters, and last run status.',
    params: [],
    example: '/api/admin/refresh',
    responseNote: 'Returns { data: { status, current_stage, current_year, files_imported, records_imported } }',
  },
  {
    method: 'POST',
    path: '/api/admin/refresh',
    description: 'Starts an on-demand USCIS refresh. Optional ADMIN_API_TOKEN can be provided in Authorization or x-admin-token.',
    params: [
      { name: 'years', type: 'body (JSON)', desc: 'Optional array of fiscal years to refresh, e.g. [2022, 2023]' },
    ],
    example: `POST /api/admin/refresh\nContent-Type: application/json\n\n{ "years": [2022, 2023] }`,
    responseNote: 'Returns { started, data } where data includes the active sync progress.',
  },
];

const METHOD_COLORS = {
  GET: 'badge-green',
  POST: 'badge-blue',
  DELETE: 'badge-red',
};

export default function ApiDocsPage() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="container api-docs-page">
      <div className="page-header">
        <h1>REST API Reference</h1>
        <p>All endpoints return JSON. Base URL: <code>http://localhost:3001</code></p>
      </div>

      {health && (
        <div className="card health-banner">
          <span className="health-dot" /> API is running &mdash; {health.records?.toLocaleString()} records, years: {(health.years_available || []).join(', ')}
        </div>
      )}

      <div className="endpoints-list">
        {ENDPOINTS.map(ep => (
          <div key={ep.path + ep.method} className="card endpoint-card">
            <div className="endpoint-header">
              <span className={`badge ${METHOD_COLORS[ep.method] || 'badge-gray'}`}>{ep.method}</span>
              <code className="endpoint-path">{ep.path}</code>
            </div>
            <p className="endpoint-desc">{ep.description}</p>

            {ep.params.length > 0 && (
              <div className="params-section">
                <div className="params-label">Parameters</div>
                <table className="params-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ep.params.map(p => (
                      <tr key={p.name}>
                        <td><code>{p.name}</code></td>
                        <td style={{ color: 'var(--gray-500)', fontSize: '0.82rem' }}>{p.type}</td>
                        <td style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>{p.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="example-section">
              <div className="params-label">Example</div>
              <pre className="code-block">{ep.example}</pre>
            </div>

            <div className="response-note">
              <span>Response: </span>{ep.responseNote}
            </div>
          </div>
        ))}
      </div>

      <div className="card rate-limit-note">
        <h3>Rate Limiting</h3>
        <p>AI enrichment endpoints (<code>/api/enrich</code>) are rate-limited to 20 requests per minute per IP. All other endpoints have no rate limit. Enrichment results are cached for 30 days.</p>
      </div>
    </div>
  );
}
