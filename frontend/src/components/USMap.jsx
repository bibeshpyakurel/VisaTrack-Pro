import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ComposableMap,
  Geographies,
  Geography,
  Annotation,
  ZoomableGroup,
} from 'react-simple-maps';
import './USMap.css';

// Real US state boundaries via US Atlas topojson
const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// FIPS code → state abbreviation
const FIPS_TO_STATE = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR',
};

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington D.C.', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

// Quantile-based color scale — 5 buckets from light to dark blue
function getColor(value, thresholds) {
  if (!value) return '#E8EFF8';
  if (value >= thresholds[3]) return '#1D4ED8'; // top 20%
  if (value >= thresholds[2]) return '#2563EB';
  if (value >= thresholds[1]) return '#3B82F6';
  if (value >= thresholds[0]) return '#93C5FD';
  return '#DBEAFE';
}

function computeThresholds(stateData) {
  const vals = stateData.map(s => s.total_approvals || 0).filter(v => v > 0).sort((a, b) => a - b);
  if (!vals.length) return [0, 0, 0, 0];
  const q = (p) => vals[Math.floor(p * vals.length)] || 0;
  return [q(0.2), q(0.4), q(0.6), q(0.8)];
}

const LEGEND_ITEMS = [
  { color: '#E8EFF8', label: 'No data' },
  { color: '#DBEAFE', label: 'Low' },
  { color: '#93C5FD', label: '' },
  { color: '#3B82F6', label: '' },
  { color: '#2563EB', label: 'High' },
  { color: '#1D4ED8', label: 'Top 20%' },
];

export default function USMap({ stateData = [] }) {
  const navigate = useNavigate();
  const [tooltip, setTooltip] = useState(null);
  const [hoveredState, setHoveredState] = useState(null);

  const dataByState = Object.fromEntries(stateData.map(s => [s.state, s]));
  const thresholds = computeThresholds(stateData);

  const totalApprovals = stateData.reduce((s, d) => s + (d.total_approvals || 0), 0);

  const TOOLTIP_W = 200;
  const TOOLTIP_H = 185;

  function clampTooltip(clientX, clientY) {
    const x = clientX + 16 + TOOLTIP_W > window.innerWidth
      ? clientX - TOOLTIP_W - 12
      : clientX + 16;
    const y = clientY - 16 + TOOLTIP_H > window.innerHeight
      ? clientY - TOOLTIP_H
      : clientY - 16;
    return { x, y };
  }

  function handleMouseEnter(geo, e) {
    const fips = geo.id?.toString().padStart(2, '0');
    const code = FIPS_TO_STATE[fips];
    if (!code) return;
    const data = dataByState[code];
    const rate = data && (data.total_approvals + data.total_denials) > 0
      ? Math.round(data.total_approvals / (data.total_approvals + data.total_denials) * 100)
      : null;
    setHoveredState(code);
    setTooltip({
      code,
      name: STATE_NAMES[code] || code,
      approvals: data?.total_approvals || 0,
      denials: data?.total_denials || 0,
      employers: data?.employer_count || 0,
      rate,
      pct: totalApprovals > 0 ? ((data?.total_approvals || 0) / totalApprovals * 100).toFixed(1) : '0',
      ...clampTooltip(e.clientX, e.clientY),
    });
  }

  function handleMouseMove(e) {
    setTooltip(t => t ? { ...t, ...clampTooltip(e.clientX, e.clientY) } : null);
  }

  function handleMouseLeave() {
    setHoveredState(null);
    setTooltip(null);
  }

  function handleClick(geo) {
    const fips = geo.id?.toString().padStart(2, '0');
    const code = FIPS_TO_STATE[fips];
    if (code) navigate(`/state/${code}`);
  }

  return (
    <div className="us-map-wrapper">
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        className="us-map-svg"
        aria-label="Interactive US Map — click a state to explore H-1B data"
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map(geo => {
              const fips = geo.id?.toString().padStart(2, '0');
              const code = FIPS_TO_STATE[fips];
              const data = dataByState[code];
              const fill = getColor(data?.total_approvals, thresholds);
              const isHovered = hoveredState === code;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isHovered ? '#1E40AF' : fill}
                  stroke="#FFFFFF"
                  strokeWidth={isHovered ? 2 : 0.8}
                  style={{
                    default: { outline: 'none', cursor: 'pointer', transition: 'fill 0.15s' },
                    hover: { outline: 'none', cursor: 'pointer' },
                    pressed: { outline: 'none' },
                  }}
                  onClick={() => handleClick(geo)}
                  onMouseEnter={e => handleMouseEnter(geo, e)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  tabIndex={0}
                  onFocus={e => handleMouseEnter(geo, e)}
                  onBlur={handleMouseLeave}
                  onKeyDown={e => e.key === 'Enter' && handleClick(geo)}
                  aria-label={`${STATE_NAMES[code] || code}: ${(data?.total_approvals || 0).toLocaleString()} approvals`}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="map-tooltip"
          style={{
            left: tooltip.x + 16,
            top: tooltip.y - 16,
          }}
        >
          <div className="tooltip-header">
            <span className="tooltip-state-name">{tooltip.name}</span>
            <span className="tooltip-state-code">{tooltip.code}</span>
          </div>
          <div className="tooltip-divider" />
          <div className="tooltip-row">
            <span>Approvals</span>
            <strong className="tooltip-green">{tooltip.approvals.toLocaleString()}</strong>
          </div>
          <div className="tooltip-row">
            <span>Denials</span>
            <strong className="tooltip-red">{tooltip.denials.toLocaleString()}</strong>
          </div>
          {tooltip.rate !== null && (
            <div className="tooltip-row">
              <span>Approval rate</span>
              <strong>{tooltip.rate}%</strong>
            </div>
          )}
          <div className="tooltip-row">
            <span>Employers</span>
            <strong>{tooltip.employers.toLocaleString()}</strong>
          </div>
          <div className="tooltip-row">
            <span>Share of total</span>
            <strong>{tooltip.pct}%</strong>
          </div>
          <div className="tooltip-cta">Click to explore →</div>
        </div>
      )}

      {/* Legend */}
      <div className="map-legend">
        <span className="legend-title">H-1B Approvals</span>
        <div className="legend-swatches">
          {LEGEND_ITEMS.map(item => (
            <div key={item.color} className="legend-item">
              <div className="legend-swatch" style={{ background: item.color }} />
              {item.label && <span>{item.label}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
