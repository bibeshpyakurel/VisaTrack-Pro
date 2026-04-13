import React, { useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/states/${stateCode}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setData(json);
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

  const { summary, top_employers, yearly_trend } = data;
  const stateName = STATE_NAMES[stateCode] || stateCode;
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
      </div>

      <div className="card">
        <h2>Yearly Trend</h2>
        <TrendChart data={yearly_trend} mode="line" title="" />
      </div>

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
                <th>Company</th>
                <th>City</th>
                <th style={{ textAlign: 'right' }}>Approvals</th>
                <th style={{ textAlign: 'right' }}>Denials</th>
              </tr>
            </thead>
            <tbody>
              {top_employers.map((emp, i) => (
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
