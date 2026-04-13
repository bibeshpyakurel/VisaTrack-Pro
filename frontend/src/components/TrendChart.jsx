import React from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export default function TrendChart({ data = [], title = 'Yearly H-1B Trend', mode = 'bar' }) {
  if (!data.length) {
    return <p style={{ color: 'var(--gray-400)', textAlign: 'center', padding: '2rem' }}>No trend data available.</p>;
  }

  const formatted = data.map(d => ({
    ...d,
    year: String(d.year),
    total_approvals: Number(d.total_approvals || 0),
    total_denials: Number(d.total_denials || 0),
    employer_count: Number(d.employer_count || 0),
  }));

  const ChartComponent = mode === 'line' ? LineChart : BarChart;

  return (
    <div className="trend-chart">
      {title && <h3 className="chart-title">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={formatted} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'var(--gray-500)' }} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--gray-500)' }} />
          <Tooltip
            contentStyle={{
              background: 'white',
              border: '1px solid var(--gray-200)',
              borderRadius: '6px',
              fontSize: '13px',
            }}
            formatter={(value, name) => [value.toLocaleString(), name === 'total_approvals' ? 'Approvals' : name === 'total_denials' ? 'Denials' : name]}
          />
          <Legend
            formatter={name => name === 'total_approvals' ? 'Approvals' : name === 'total_denials' ? 'Denials' : name}
            wrapperStyle={{ fontSize: '13px' }}
          />
          {mode === 'bar' ? (
            <>
              <Bar dataKey="total_approvals" fill="#2563EB" radius={[3, 3, 0, 0]} />
              <Bar dataKey="total_denials" fill="#FCA5A5" radius={[3, 3, 0, 0]} />
            </>
          ) : (
            <>
              <Line type="monotone" dataKey="total_approvals" stroke="#2563EB" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="total_denials" stroke="#EF4444" strokeWidth={2} dot={{ r: 4 }} />
            </>
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
