import React from 'react';

export default function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;

  const range = [];
  const delta = 2;
  for (let i = Math.max(1, page - delta); i <= Math.min(pages, page + delta); i++) {
    range.push(i);
  }

  return (
    <div className="pagination">
      <button
        className="btn btn-secondary"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
      >
        Prev
      </button>

      {range[0] > 1 && (
        <>
          <button className="btn btn-secondary" onClick={() => onPage(1)}>1</button>
          {range[0] > 2 && <span className="pagination-ellipsis">…</span>}
        </>
      )}

      {range.map(p => (
        <button
          key={p}
          className={`btn ${p === page ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onPage(p)}
        >
          {p}
        </button>
      ))}

      {range[range.length - 1] < pages && (
        <>
          {range[range.length - 1] < pages - 1 && <span className="pagination-ellipsis">…</span>}
          <button className="btn btn-secondary" onClick={() => onPage(pages)}>{pages}</button>
        </>
      )}

      <button
        className="btn btn-secondary"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
      >
        Next
      </button>
    </div>
  );
}
