import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import TrendChart from '../components/TrendChart.jsx';
import './CompanyPage.css';

export default function CompanyPage() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name);
  const [company, setCompany] = useState(null);
  const [enrichment, setEnrichment] = useState(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartMode, setChartMode] = useState('bar');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/companies/${encodeURIComponent(decodedName)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setCompany(data);
        if (data.enrichment) setEnrichment(data.enrichment);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [decodedName]);

  function handleEnrich() {
    setEnrichLoading(true);
    fetch(`/api/enrich/${encodeURIComponent(decodedName)}`)
      .then(r => r.json())
      .then(data => {
        setEnrichment(data);
        setCompany(c => ({ ...c, enrichment: data }));
      })
      .catch(console.error)
      .finally(() => setEnrichLoading(false));
  }

  if (loading) return <div className="container"><div className="spinner" /></div>;
  if (error) return <div className="container"><div className="error-box">{error}</div></div>;
  if (!company) return null;

  const latest = company.history?.[company.history.length - 1];
  const approvalRate = company.total_approvals + company.total_denials > 0
    ? Math.round(company.total_approvals / (company.total_approvals + company.total_denials) * 100)
    : null;

  return (
    <div className="container company-page">
      <div className="breadcrumb">
        <Link to="/companies">Companies</Link>
        <span>/</span>
        {latest?.state && (
          <>
            <Link to={`/state/${latest.state}`}>{latest.state}</Link>
            <span>/</span>
          </>
        )}
        <span>{decodedName}</span>
      </div>

      <div className="company-header card">
        <div className="company-title-row">
          <div>
            <h1>{decodedName}</h1>
            <div className="company-meta">
              {latest?.city && <span>{latest.city}</span>}
              {latest?.state && (
                <Link to={`/state/${latest.state}`}>
                  <span className="badge badge-blue">{latest.state}</span>
                </Link>
              )}
              {(enrichment?.industry || latest?.naics_description) && (
                <span className="badge badge-gray">
                  {enrichment?.industry || latest?.naics_description}
                </span>
              )}
            </div>
            {enrichment?.description && (
              <p className="company-description">{enrichment.description}</p>
            )}
          </div>
          <div className="company-links">
            {enrichment?.website && (
              <a href={enrichment.website} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                Website
              </a>
            )}
            {enrichment?.linkedin_url && (
              <a href={enrichment.linkedin_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                LinkedIn
              </a>
            )}
            {!enrichment && (
              <button
                className="btn btn-primary"
                onClick={handleEnrich}
                disabled={enrichLoading}
              >
                {enrichLoading ? 'Looking up…' : 'AI Enrich'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="value">{company.total_approvals.toLocaleString()}</div>
          <div className="label">Total Approvals</div>
        </div>
        <div className="stat-card">
          <div className="value">{company.total_denials.toLocaleString()}</div>
          <div className="label">Total Denials</div>
        </div>
        <div className="stat-card">
          <div className="value">{approvalRate !== null ? `${approvalRate}%` : '—'}</div>
          <div className="label">Approval Rate</div>
        </div>
        <div className="stat-card">
          <div className="value">{company.years_active}</div>
          <div className="label">Years Active</div>
        </div>
      </div>

      <div className="card">
        <div className="chart-header">
          <h2>H-1B Petition History</h2>
          <div className="chart-mode-toggle">
            <button
              className={`btn ${chartMode === 'bar' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setChartMode('bar')}
            >
              Bar
            </button>
            <button
              className={`btn ${chartMode === 'line' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setChartMode('line')}
            >
              Line
            </button>
          </div>
        </div>
        <TrendChart data={company.history} mode={chartMode} title="" />
      </div>

      <div className="card">
        <h2>Year-by-Year Breakdown</h2>
        <div className="table-wrapper" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th style={{ textAlign: 'right' }}>Initial Approvals</th>
                <th style={{ textAlign: 'right' }}>Initial Denials</th>
                <th style={{ textAlign: 'right' }}>Continuing Approvals</th>
                <th style={{ textAlign: 'right' }}>Continuing Denials</th>
                <th style={{ textAlign: 'right' }}>Total Approvals</th>
              </tr>
            </thead>
            <tbody>
              {company.history.map(row => (
                <tr key={row.year}>
                  <td><strong>{row.year}</strong></td>
                  <td style={{ textAlign: 'right' }}>{row.initial_approvals.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: 'var(--red-600)' }}>{row.initial_denials.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{row.continuing_approvals.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: 'var(--red-600)' }}>{row.continuing_denials.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green-600)' }}>
                    {row.total_approvals.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
