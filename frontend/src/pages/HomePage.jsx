import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import USMap from '../components/USMap.jsx';
import TrendChart from '../components/TrendChart.jsx';
import './HomePage.css';

const adminToken = import.meta.env.VITE_ADMIN_TOKEN;

function getSyncTone(status) {
  if (status === 'completed') return 'success';
  if (status === 'running') return 'active';
  if (status === 'failed') return 'danger';
  return 'neutral';
}

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const year = searchParams.get('year') || '';

  const [stateData, setStateData] = useState([]);
  const [salaryData, setSalaryData] = useState([]);
  const [mapMode, setMapMode] = useState('approvals');
  const [summary, setSummary] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [nationalTrend, setNationalTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const url = year ? `/api/states?year=${year}` : '/api/states';
        const [statesRes, healthRes, syncRes, trendRes, salaryRes] = await Promise.all([
          fetch(url),
          fetch('/api/health'),
          fetch('/api/admin/refresh'),
          fetch('/api/states/national-trend'),
          fetch('/api/lca/by-state'),
        ]);

        const [statesJson, healthJson, syncJson, trendJson, salaryJson] = await Promise.all([
          statesRes.json(),
          healthRes.json(),
          syncRes.json(),
          trendRes.json(),
          salaryRes.json(),
        ]);

        if (cancelled) {
          return;
        }

        setStateData(statesJson.data || []);
        setSummary(healthJson);
        setSyncStatus(syncJson.data || null);
        setNationalTrend(trendJson.data || []);
        setSalaryData(salaryJson.data || []);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [year]);

  useEffect(() => {
    if (!syncStatus || syncStatus.status !== 'running') {
      return undefined;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const [healthRes, syncRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/admin/refresh'),
        ]);
        const [healthJson, syncJson] = await Promise.all([healthRes.json(), syncRes.json()]);
        setSummary(healthJson);
        setSyncStatus(syncJson.data || null);
      } catch {
      }
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [syncStatus]);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshMessage('');

    try {
      const response = await fetch('/api/admin/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'x-admin-token': adminToken } : {}),
        },
        body: JSON.stringify({}),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Refresh failed');
      }

      setSyncStatus(payload.data || null);
      setRefreshMessage(payload.started ? 'Refresh started.' : 'A refresh is already in progress.');
    } catch (err) {
      setRefreshMessage(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  const isSyncRunning = syncStatus?.status === 'running';
  const syncTone = getSyncTone(syncStatus?.status);
  const lastImportLabel = summary?.last_import?.at
    ? new Date(summary.last_import.at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Not imported yet';

  const topStates = [...stateData].sort((a, b) => b.total_approvals - a.total_approvals).slice(0, 10);
  const totalApprovals = stateData.reduce((s, d) => s + (d.total_approvals || 0), 0);
  const totalEmployers = stateData.reduce((s, d) => s + (d.employer_count || 0), 0);

  return (
    <div className="container home-page">
      <div className="home-hero">
        <div>
          <h1>H-1B Employer Intelligence</h1>
          <p>Explore USCIS H-1B petition data by state, company, and year. Powered by real data and AI enrichment.</p>
        </div>
        <div className="hero-actions">
          <Link to="/companies" className="btn btn-primary">Browse Companies</Link>
        </div>
      </div>

      {summary && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="value">{(summary.records || 0).toLocaleString()}</div>
            <div className="label">Total Records</div>
          </div>
          <div className="stat-card">
            <div className="value">{totalApprovals.toLocaleString()}</div>
            <div className="label">{year ? `${year} ` : ''}Approvals</div>
          </div>
          <div className="stat-card">
            <div className="value">{totalEmployers.toLocaleString()}</div>
            <div className="label">Unique Employers</div>
          </div>
          <div className="stat-card">
            <div className="value">{(summary.years_available || []).length}</div>
            <div className="label">Fiscal Years</div>
          </div>
        </div>
      )}

      <div className={`card refresh-card refresh-card-${syncTone}`}>
        <div className="refresh-card-header">
          <div className="refresh-card-title-group">
            <div className="refresh-kicker-row">
              <span className={`refresh-status-badge refresh-status-${syncTone}`}>
                {syncStatus?.status || 'idle'}
              </span>
              <span className="refresh-kicker">USCIS data pipeline</span>
            </div>
            <h2>Data Refresh</h2>
            <p>
              USCIS data is imported automatically on first run and refreshed annually. You can also trigger an on-demand refresh here.
            </p>
          </div>
          <button
            type="button"
            className="btn refresh-action-btn"
            onClick={handleRefresh}
            disabled={refreshing || isSyncRunning}
          >
            {refreshing || isSyncRunning ? 'Refreshing…' : 'Refresh Data'}
          </button>
        </div>

        <div className="refresh-overview-row">
          <div className="refresh-overview-copy">
            <span className="refresh-overview-label">Latest completed import</span>
            <strong>{lastImportLabel}</strong>
            <p>
              {syncStatus?.current_stage
                ? `Current stage: ${syncStatus.current_stage}`
                : 'Ready for the next on-demand or scheduled refresh.'}
            </p>
          </div>
          <div className="refresh-overview-pill-group">
            <div className="refresh-pill">
              <span>Latest year</span>
              <strong>{syncStatus?.current_year || '—'}</strong>
            </div>
            <div className="refresh-pill">
              <span>Files synced</span>
              <strong>{(syncStatus?.files_imported || 0).toLocaleString()}</strong>
            </div>
          </div>
        </div>

        <div className="refresh-metrics">
          <div className="refresh-metric-tile refresh-metric-highlight">
            <span>Status</span>
            <strong>{syncStatus?.status || 'idle'}</strong>
            <small>Run state for the USCIS sync job</small>
          </div>
          <div className="refresh-metric-tile">
            <span>Stage</span>
            <strong>{syncStatus?.current_stage || 'ready'}</strong>
            <small>Download, import, or completion phase</small>
          </div>
          <div className="refresh-metric-tile">
            <span>CSV Rows Processed</span>
            <strong>{(syncStatus?.records_imported || 0).toLocaleString()}</strong>
            <small>Raw USCIS rows read in the latest run</small>
          </div>
          <div className="refresh-metric-tile">
            <span>Stored Records</span>
            <strong>{(summary?.records || 0).toLocaleString()}</strong>
            <small>Unique rows currently stored in SQLite</small>
          </div>
          <div className="refresh-metric-tile">
            <span>Files Imported</span>
            <strong>{(syncStatus?.files_imported || 0).toLocaleString()}</strong>
            <small>Yearly CSV files processed in the latest run</small>
          </div>
          <div className="refresh-metric-tile">
            <span>Last Import</span>
            <strong>{lastImportLabel}</strong>
            <small>{summary?.last_import?.filename || 'No import file recorded yet'}</small>
          </div>
        </div>

        {refreshMessage && <div className="refresh-message">{refreshMessage}</div>}
        {syncStatus?.error_message && <div className="error-box">Last sync error: {syncStatus.error_message}</div>}
      </div>

      <div className="card map-card">
        <div className="map-header">
          <div className="map-header-left">
            <h2>{mapMode === 'salary' ? 'Avg. H-1B Salary by State' : 'H-1B Approvals by State'}</h2>
            <div className="map-mode-toggle">
              <button
                className={`btn ${mapMode === 'approvals' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMapMode('approvals')}
              >Approvals</button>
              <button
                className={`btn ${mapMode === 'salary' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMapMode('salary')}
              >Avg Salary</button>
            </div>
          </div>
          {mapMode === 'approvals' && (
            <div className="year-filter">
              <label htmlFor="year-select">Year:</label>
              <select
                id="year-select"
                value={year}
                onChange={e => setSearchParams(e.target.value ? { year: e.target.value } : {})}
              >
                <option value="">All Years</option>
                {(summary?.years_available || []).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
          {mapMode === 'salary' && (
            <span className="map-salary-note">Source: DOL LCA FY2023–2025</span>
          )}
        </div>

        {loading ? (
          <div className="spinner" />
        ) : error ? (
          <div className="error-box">Failed to load map data: {error}</div>
        ) : (
          <USMap stateData={stateData} salaryData={salaryData} mode={mapMode} />
        )}
      </div>

      {nationalTrend.length > 0 && (
        <div className="card national-trend-card">
          <div className="chart-header-row">
            <div>
              <h2>National H-1B Trends</h2>
              <p>Total approvals and denials across all employers, all states</p>
            </div>
          </div>
          <TrendChart data={nationalTrend} mode="bar" title="" />
        </div>
      )}

      <div className="home-bottom">
        <div className="card top-states-card">
          <h2>Top States by Approvals</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>State</th>
                <th>Approvals</th>
                <th>Employers</th>
              </tr>
            </thead>
            <tbody>
              {topStates.map((s, i) => (
                <tr key={s.state}>
                  <td style={{ color: 'var(--gray-400)', width: 32 }}>{i + 1}</td>
                  <td>
                    <Link to={`/state/${s.state}`}>{s.state}</Link>
                  </td>
                  <td>{(s.total_approvals || 0).toLocaleString()}</td>
                  <td>{(s.employer_count || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card about-card">
          <h2>What is VisaTrack Pro?</h2>
          <p>
            VisaTrack Pro ingests official USCIS H-1B petition data and makes it searchable,
            visual, and enriched with AI-powered company context.
          </p>
          <ul className="feature-list">
            <li>Interactive US map — click any state to drill in</li>
            <li>Search and filter 500k+ petition records</li>
            <li>Company profiles with website, LinkedIn, and industry</li>
            <li>Yearly trend charts per company and state</li>
            <li>Clean REST API for developers</li>
          </ul>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <Link to="/companies" className="btn btn-primary">Browse Companies</Link>
            <Link to="/api-docs" className="btn btn-secondary">API Docs</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
