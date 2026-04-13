import React, { useEffect, useState } from 'react';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR - i);

export default function SearchFilters({ filters, onChange, onSearchChange }) {
  const [industries, setIndustries] = useState([]);

  useEffect(() => {
    fetch('/api/industries')
      .then(r => r.json())
      .then(data => setIndustries(data.data || []))
      .catch(() => {});
  }, []);

  function handleChange(field, value) {
    onChange({ ...filters, [field]: value, page: 1 });
  }

  const hasFilters = filters.search || filters.state || filters.year || filters.industry;

  return (
    <div className="search-filters">
      <div className="filter-group search-group">
        <input
          type="text"
          placeholder="Search companies..."
          value={filters.search || ''}
          onChange={e => {
            // If parent supplies onSearchChange, use it (enables debouncing)
            // Otherwise fall through to normal filter change
            if (onSearchChange) {
              onSearchChange(e.target.value);
            } else {
              handleChange('search', e.target.value);
            }
          }}
          className="search-input"
          aria-label="Search companies"
        />
      </div>

      <div className="filter-group">
        <select
          value={filters.state || ''}
          onChange={e => handleChange('state', e.target.value)}
          aria-label="Filter by state"
        >
          <option value="">All States</option>
          {STATES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <select
          value={filters.year || ''}
          onChange={e => handleChange('year', e.target.value)}
          aria-label="Filter by year"
        >
          <option value="">All Years</option>
          {YEARS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {industries.length > 0 && (
        <div className="filter-group">
          <select
            value={filters.industry || ''}
            onChange={e => handleChange('industry', e.target.value)}
            aria-label="Filter by industry"
          >
            <option value="">All Industries</option>
            {industries.map(i => (
              <option key={i.industry} value={i.industry}>
                {i.industry.length > 40 ? i.industry.slice(0, 40) + '…' : i.industry}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="filter-group">
        <select
          value={filters.sort || 'total_approvals'}
          onChange={e => handleChange('sort', e.target.value)}
          aria-label="Sort by"
        >
          <option value="total_approvals">Most Approvals</option>
          <option value="total_denials">Most Denials</option>
          <option value="initial_approvals">Initial Approvals</option>
          <option value="employer_name">Name A-Z</option>
        </select>
      </div>

      {hasFilters && (
        <button
          className="btn btn-secondary"
          onClick={() => {
            if (onSearchChange) onSearchChange('');
            onChange({ search: '', state: '', year: '', industry: '', sort: 'total_approvals', page: 1 });
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
