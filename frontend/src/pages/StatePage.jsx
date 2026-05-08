import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import TrendChart from '../components/TrendChart.jsx';
import './StatePage.css';

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington D.C.',
};

export default function StatePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const stateCode = code.toUpperCase();
  const [data, setData] = useState(null);
  const [lcaSummary, setLcaSummary] = useState(null);
  const [lcaTopPaying, setLcaTopPaying] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [empSort, setEmpSort] = useState({ col: 'total_approvals', dir: 'desc' });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/states/${stateCode}`).then(r => r.json()),
      fetch(`/api/lca/summary?state=${stateCode}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/lca/top-paying?state=${stateCode}&limit=10`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([stateJson, lcaSum, lcaTop]) => {
        if (stateJson.error) throw new Error(stateJson.error);
        setData(stateJson);
        if (lcaSum && !lcaSum.error) setLcaSummary(lcaSum);
        if (lcaTop?.data) setLcaTopPaying(lcaTop.data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [stateCode]);

  if (loading) return <div className="container"><div className="spinner" /></div>;
  if (error) return (
    <div className="container">
      <div className="error-box">{error}</div>
      <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => navigate('/')}>
        Back to Map
      </button>
    </div>
  );
  if (!data) return null;

  const { summary, top_employers, yearly_trend, top_industries = [] } = data;
  const stateName = STATE_NAMES[stateCode] || stateCode;

  function toggleSort(col) {
    setEmpSort(s => s.col === col
      ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' }
      : { col, dir: 'desc' }
    );
  }

  const sortedEmployers = [...top_employers].sort((a, b) => {
    const mul = empSort.dir === 'desc' ? -1 : 1;
    if (empSort.col === 'employer_name') return mul * a.employer_name.localeCompare(b.employer_name);
    return mul * ((a[empSort.col] || 0) - (b[empSort.col] || 0));
  });

  function SortIcon({ col }) {
    if (empSort.col !== col) return <span style={{ color: 'var(--gray-200)', marginLeft: 4 }}>↕</span>;
    return <span style={{ color: 'var(--blue-600)', marginLeft: 4 }}>{empSort.dir === 'desc' ? '↓' : '↑'}</span>;
  }
  const approvalRate = summary.total_approvals + summary.total_denials > 0
    ? Math.round(summary.total_approvals / (summary.total_approvals + summary.total_denials) * 100)
    : null;

  return (
    <div className="container state-page">
      <div className="breadcrumb">
        <Link to="/">Map</Link>
        <span>/</span>
        <span>{stateName}</span>
      </div>

      <div className="page-header">
        <h1>{stateName} H-1B Data</h1>
        <p>All-time H-1B petition data for employers in {stateName}</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="value">{(summary.total_approvals || 0).toLocaleString()}</div>
          <div className="label">Total Approvals</div>
        </div>
        <div className="stat-card">
          <div className="value">{(summary.total_denials || 0).toLocaleString()}</div>
          <div className="label">Total Denials</div>
        </div>
        <div className="stat-card">
          <div className="value">{approvalRate !== null ? `${approvalRate}%` : '—'}</div>
          <div className="label">Approval Rate</div>
        </div>
        <div className="stat-card">
          <div className="value">{(summary.employer_count || 0).toLocaleString()}</div>
          <div className="label">Employers</div>
        </div>
        {lcaSummary?.avg_wage && (
          <div className="stat-card">
            <div className="value" style={{ color: 'var(--green-600)' }}>
              ${Math.round(lcaSummary.avg_wage / 1000)}k
            </div>
            <div className="label">Avg. Offered Wage</div>
          </div>
        )}
        {lcaSummary?.total_petitions > 0 && (
          <div className="stat-card">
            <div className="value">{lcaSummary.total_petitions.toLocaleString()}</div>
            <div className="label">LCA Petitions</div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Yearly Trend</h2>
        <TrendChart data={yearly_trend} mode="line" title="" />
      </div>

      {top_industries.length > 0 && (
        <div className="card">
          <h2 className="section-title">Top Industries in {stateCode}</h2>
          <div className="industries-list">
            {(() => {
              const maxApprovals = top_industries[0]?.total_approvals || 1;
              return top_industries.map((ind, i) => {
                const pct = Math.round((ind.total_approvals / maxApprovals) * 100);
                return (
                  <div key={ind.industry} className="industry-row">
                    <div className="industry-meta">
                      <span className="industry-rank">{i + 1}</span>
                      <span className="industry-name">{ind.industry}</span>
                      <span className="industry-employers">{ind.employer_count.toLocaleString()} employers</span>
                    </div>
                    <div className="industry-bar-wrap">
                      <div className="industry-bar" style={{ width: `${pct}%` }} />
                      <span className="industry-approvals">{ind.total_approvals.toLocaleString()}</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {lcaTopPaying.length > 0 && (
        <div className="card">
          <h2 className="section-title">Top Paying Employers</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--gray-400)', marginBottom: '0.85rem' }}>
            Ranked by avg. offered wage · Source: DOL LCA FY2023–2025
          </p>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Employer</th>
                  <th style={{ textAlign: 'right' }}>Avg Wage</th>
                  <th style={{ textAlign: 'right' }}>Range</th>
                  <th style={{ textAlign: 'right' }}>Petitions</th>
                </tr>
              </thead>
              <tbody>
                {lcaTopPaying.map((emp, i) => (
                  <tr key={emp.employer_name}>
                    <td style={{ color: 'var(--gray-400)', width: 28 }}>{i + 1}</td>
                    <td>
                      <Link to={`/company/${encodeURIComponent(emp.employer_name)}`} style={{ fontWeight: 600 }}>
                        {emp.employer_name}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green-600)' }}>
                      ${Math.round(emp.avg_wage / 1000)}k
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--gray-500)' }}>
                      ${Math.round(emp.min_wage / 1000)}k – ${Math.round(emp.max_wage / 1000)}k
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--gray-600)' }}>
                      {emp.petitions.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="top-employers-header">
          <h2>Top Employers in {stateCode}</h2>
          <Link
            to={`/companies?state=${stateCode}`}
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}
          >
            View All
          </Link>
        </div>
        <div className="table-wrapper" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th onClick={() => toggleSort('employer_name')} className="sortable-th">
                  Company <SortIcon col="employer_name" />
                </th>
                <th>City</th>
                <th style={{ textAlign: 'right' }} onClick={() => toggleSort('total_approvals')} className="sortable-th">
                  Approvals <SortIcon col="total_approvals" />
                </th>
                <th style={{ textAlign: 'right' }} onClick={() => toggleSort('total_denials')} className="sortable-th">
                  Denials <SortIcon col="total_denials" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEmployers.map((emp, i) => (
                <tr key={emp.employer_name}>
                  <td style={{ color: 'var(--gray-400)', width: 32 }}>{i + 1}</td>
                  <td>
                    <Link to={`/company/${encodeURIComponent(emp.employer_name)}`} style={{ fontWeight: 600 }}>
                      {emp.employer_name}
                    </Link>
                  </td>
                  <td style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>{emp.city || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green-600)' }}>
                    {(emp.total_approvals || 0).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--red-600)' }}>
                    {(emp.total_denials || 0).toLocaleString()}
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
