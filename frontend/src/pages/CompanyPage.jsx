import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import TrendChart from '../components/TrendChart.jsx';
import { useRecentlyViewed } from '../hooks/useRecentlyViewed.js';
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
  const recentlyViewed = useRecentlyViewed(decodedName);
  const [lcaData, setLcaData] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/companies/${encodeURIComponent(decodedName)}`).then(r => r.json()),
      fetch(`/api/lca/companies/${encodeURIComponent(decodedName)}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([companyData, lca]) => {
        if (companyData.error) throw new Error(companyData.error);
        setCompany(companyData);
        if (companyData.enrichment) setEnrichment(companyData.enrichment);
        if (lca && !lca.error) setLcaData(lca);
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
                Website ↗
              </a>
            )}
            {enrichment?.linkedin_url && (
              <a href={enrichment.linkedin_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary linkedin-btn">
                LinkedIn ↗
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
            <button className="btn btn-secondary no-print" onClick={() => window.print()}>
              Print / PDF
            </button>
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

      {lcaData && (
        <div className="card lca-card">
          <div className="lca-header">
            <div>
              <h2 className="section-card-title">DOL Salary & Petition Data</h2>
              <p className="section-card-sub">Source: Dept. of Labor LCA disclosures · FY2023–2025</p>
            </div>
            <span className="badge badge-blue">Live DOL Data</span>
          </div>

          <div className="lca-wage-grid">
            <div className="lca-wage-tile lca-wage-primary">
              <span>Avg. Offered Wage</span>
              <strong>{lcaData.wage_stats.wage_avg ? `$${Math.round(lcaData.wage_stats.wage_avg / 1000)}k` : '—'}</strong>
            </div>
            <div className="lca-wage-tile">
              <span>Wage Range</span>
              <strong>
                {lcaData.wage_stats.wage_min && lcaData.wage_stats.wage_max
                  ? `$${Math.round(lcaData.wage_stats.wage_min / 1000)}k – $${Math.round(lcaData.wage_stats.wage_max / 1000)}k`
                  : '—'}
              </strong>
            </div>
            <div className="lca-wage-tile">
              <span>Avg. Prevailing Wage</span>
              <strong>{lcaData.wage_stats.prevailing_avg ? `$${Math.round(lcaData.wage_stats.prevailing_avg / 1000)}k` : '—'}</strong>
            </div>
            <div className="lca-wage-tile">
              <span>Total Petitions</span>
              <strong>{(lcaData.wage_stats.total_petitions || 0).toLocaleString()}</strong>
            </div>
            <div className="lca-wage-tile">
              <span>Certified</span>
              <strong style={{ color: 'var(--green-600)' }}>{(lcaData.wage_stats.certified || 0).toLocaleString()}</strong>
            </div>
            <div className="lca-wage-tile">
              <span>Denied / Withdrawn</span>
              <strong style={{ color: 'var(--red-600)' }}>
                {((lcaData.wage_stats.denied || 0) + (lcaData.wage_stats.withdrawn || 0)).toLocaleString()}
              </strong>
            </div>
          </div>

          {lcaData.yearly_wage.length > 0 && (
            <div className="lca-yearly">
              <h3 className="lca-section-label">Year-over-Year Avg. Wage</h3>
              <div className="lca-year-bars">
                {(() => {
                  const maxWage = Math.max(...lcaData.yearly_wage.map(r => r.avg_wage || 0));
                  return lcaData.yearly_wage.map(r => (
                    <div key={r.fiscal_year} className="lca-year-bar-row">
                      <span className="lca-year-label">FY{r.fiscal_year}</span>
                      <div className="lca-bar-track">
                        <div className="lca-bar-fill" style={{ width: `${Math.round((r.avg_wage / maxWage) * 100)}%` }} />
                      </div>
                      <span className="lca-year-value">${Math.round(r.avg_wage / 1000)}k</span>
                      <span className="lca-year-count">{r.petitions.toLocaleString()} petitions</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          <div className="lca-bottom-row">
            {lcaData.job_titles.length > 0 && (
              <div className="lca-section">
                <h3 className="lca-section-label">Top Job Titles</h3>
                <div className="lca-tag-list">
                  {lcaData.job_titles.map(j => (
                    <span key={j.job_title} className="lca-tag">
                      {j.job_title} <em>{j.count}</em>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {lcaData.wage_levels.length > 0 && (
              <div className="lca-section">
                <h3 className="lca-section-label">Wage Levels</h3>
                <div className="lca-levels">
                  {lcaData.wage_levels.map(l => (
                    <div key={l.level} className="lca-level-row">
                      <span className="lca-level-badge">Level {l.level}</span>
                      <div className="lca-level-bar-track">
                        <div
                          className="lca-level-bar-fill"
                          style={{ width: `${Math.round(l.count / lcaData.wage_stats.total_petitions * 100)}%` }}
                        />
                      </div>
                      <span className="lca-level-count">{l.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

      {company.similar?.length > 0 && (
        <div className="card">
          <h2 className="section-card-title">Similar Companies</h2>
          <p className="section-card-sub">Same industry · {latest?.state}</p>
          <div className="similar-list">
            {company.similar.map(s => (
              <Link
                key={s.employer_name}
                to={`/company/${encodeURIComponent(s.employer_name)}`}
                className="similar-item"
              >
                <span className="similar-name">{s.employer_name}</span>
                <span className="similar-meta">
                  {s.city ? `${s.city} · ` : ''}{(s.total_approvals || 0).toLocaleString()} approvals
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recentlyViewed.filter(r => r.name !== decodedName).length > 0 && (
        <div className="card">
          <h2 className="section-card-title">Recently Viewed</h2>
          <div className="similar-list">
            {recentlyViewed.filter(r => r.name !== decodedName).map(r => (
              <Link
                key={r.name}
                to={`/company/${encodeURIComponent(r.name)}`}
                className="similar-item"
              >
                <span className="similar-name">{r.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

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
