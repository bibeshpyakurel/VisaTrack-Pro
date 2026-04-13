import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SearchFilters from '../components/SearchFilters.jsx';
import Pagination from '../components/Pagination.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import './CompaniesPage.css';

function downloadCSV(companies, filters) {
  const header = ['Company', 'City', 'State', 'Industry', 'Total Approvals', 'Total Denials', 'Approval Rate %'];
  const rows = companies.map(c => {
    const rate = c.total_approvals + c.total_denials > 0
      ? Math.round(c.total_approvals / (c.total_approvals + c.total_denials) * 100)
      : '';
    return [
      `"${c.employer_name.replace(/"/g, '""')}"`,
      `"${(c.city || '').replace(/"/g, '""')}"`,
      c.state || '',
      `"${(c.industry || c.naics_description || '').replace(/"/g, '""')}"`,
      c.total_approvals || 0,
      c.total_denials || 0,
      rate,
    ].join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const label = [filters.state, filters.year, filters.search].filter(Boolean).join('_') || 'all';
  a.download = `h1b_companies_${label}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CompaniesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Local search input — debounced before hitting the API
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const debouncedSearch = useDebounce(searchInput, 300);

  // Batch enrichment state
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState('');

  const filters = {
    search: debouncedSearch,
    state: searchParams.get('state') || '',
    year: searchParams.get('year') || '',
    industry: searchParams.get('industry') || '',
    sort: searchParams.get('sort') || 'total_approvals',
    page: parseInt(searchParams.get('page') || '1'),
  };

  // Sync debounced search → URL (reset to page 1)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const params = buildParams({ ...filters, search: debouncedSearch, page: 1 });
    setSearchParams(params);
  }, [debouncedSearch]);

  function buildParams(f) {
    const params = new URLSearchParams();
    if (f.search)    params.set('search', f.search);
    if (f.state)     params.set('state', f.state);
    if (f.year)      params.set('year', f.year);
    if (f.industry)  params.set('industry', f.industry);
    if (f.sort)      params.set('sort', f.sort);
    params.set('page', String(f.page || 1));
    return params;
  }

  const fetchCompanies = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filters.search)   params.set('search', filters.search);
    if (filters.state)    params.set('state', filters.state);
    if (filters.year)     params.set('year', filters.year);
    if (filters.industry) params.set('industry', filters.industry);
    params.set('sort', filters.sort);
    params.set('order', 'desc');
    params.set('page', filters.page);
    params.set('limit', '25');

    fetch(`/api/companies?${params}`)
      .then(r => r.json())
      .then(json => {
        setCompanies(json.data || []);
        setPagination(json.pagination || { page: 1, pages: 1, total: 0 });
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [searchParams.toString(), debouncedSearch]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  function handleFilterChange(newFilters) {
    // Keep local search in sync when Clear is hit
    if (newFilters.search !== undefined) setSearchInput(newFilters.search);
    setSearchParams(buildParams(newFilters));
  }

  function handlePage(p) {
    handleFilterChange({ ...filters, page: p });
  }

  async function handleEnrichTop10() {
    const top10 = companies.slice(0, 10).map(c => c.employer_name);
    if (!top10.length) return;
    setEnriching(true);
    setEnrichMsg('');
    try {
      const res = await fetch('/api/enrich/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: top10 }),
      });
      const data = await res.json();
      const enriched = data.results?.filter(r => !r.error).length || 0;
      setEnrichMsg(`Enriched ${enriched} of ${top10.length} companies. Reload to see updates.`);
    } catch {
      setEnrichMsg('Enrichment failed. Check your API key.');
    } finally {
      setEnriching(false);
    }
  }

  const hasActiveFilters = filters.search || filters.state || filters.year || filters.industry;

  return (
    <div className="container companies-page">
      <div className="companies-header">
        <div>
          <h1>H-1B Companies</h1>
          <p>Search and filter employers by approvals, state, year, and industry</p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => downloadCSV(companies, filters)}
            disabled={companies.length === 0}
            title="Download current page as CSV"
          >
            Export CSV
          </button>
          <button
            className="btn btn-primary"
            onClick={handleEnrichTop10}
            disabled={enriching || companies.length === 0}
            title="AI-enrich the top 10 companies shown"
          >
            {enriching ? 'Enriching…' : 'Enrich Top 10'}
          </button>
        </div>
      </div>

      {enrichMsg && (
        <div className="enrich-msg">{enrichMsg}</div>
      )}

      <SearchFilters
        filters={{ ...filters, search: searchInput }}
        onChange={handleFilterChange}
        onSearchChange={setSearchInput}
      />

      {!loading && !error && (
        <div className="results-info">
          <span>
            {pagination.total.toLocaleString()} companies found
            {filters.state    ? ` in ${filters.state}`        : ''}
            {filters.year     ? ` · FY${filters.year}`        : ''}
            {filters.industry ? ` · ${filters.industry.slice(0, 40)}` : ''}
          </span>
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : error ? (
        <div className="error-box">Failed to load companies: {error}</div>
      ) : companies.length === 0 ? (
        <div className="card empty-state">
          <p>No companies found matching your filters.</p>
          {hasActiveFilters && (
            <button
              className="btn btn-secondary"
              style={{ marginTop: '1rem' }}
              onClick={() => handleFilterChange({ search: '', state: '', year: '', industry: '', sort: 'total_approvals', page: 1 })}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrapper card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="hide-mobile">State</th>
                  <th className="hide-mobile">Industry</th>
                  <th style={{ textAlign: 'right' }}>Approvals</th>
                  <th style={{ textAlign: 'right' }} className="hide-mobile">Denials</th>
                  <th style={{ textAlign: 'right' }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {companies.map(c => {
                  const rate = c.total_approvals + c.total_denials > 0
                    ? Math.round(c.total_approvals / (c.total_approvals + c.total_denials) * 100)
                    : null;
                  const locationLabel = c.city || (c.states_active > 1 ? 'Multiple locations' : '');
                  return (
                    <tr key={c.employer_name}>
                      <td>
                        <Link to={`/company/${encodeURIComponent(c.employer_name)}`} className="company-link">
                          {c.employer_name}
                        </Link>
                        {locationLabel && <div className="company-city">{locationLabel}</div>}
                      </td>
                      <td className="hide-mobile">
                        {c.state ? (
                          <Link to={`/state/${c.state}`}>
                            <span className="badge badge-blue">{c.state}</span>
                          </Link>
                        ) : c.states_active > 1 ? 'Multi-state' : '—'}
                      </td>
                      <td className="hide-mobile" style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>
                        {c.industry || c.naics_description?.slice(0, 40) || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green-600)' }}>
                        {(c.total_approvals || 0).toLocaleString()}
                      </td>
                      <td className="hide-mobile" style={{ textAlign: 'right', color: 'var(--red-600)' }}>
                        {(c.total_denials || 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {rate !== null ? (
                          <span className={`badge ${rate >= 80 ? 'badge-green' : rate >= 60 ? 'badge-gray' : 'badge-red'}`}>
                            {rate}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={pagination.page} pages={pagination.pages} onPage={handlePage} />
        </>
      )}
    </div>
  );
}
