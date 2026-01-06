import React from 'react';

export default function TablePageHeader({ summary, filters, actions }) {
  return (
    <>
      {/* Summary section (e.g., Payments Balance card) */}
      {summary && (
        <div style={{ minWidth: 0 }}>
          {summary}
        </div>
      )}

      {/* Filters section (inline horizontal filters) */}
      {filters && (
        <div
          style={{
            display: 'inline-flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            gap: 12,
            minWidth: 'max-content',
          }}
        >
          {filters}
        </div>
      )}

      {/* Actions section (Add, Export, etc.) */}
      {actions && (
        <div
          style={{
            display: 'inline-flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            gap: 8,
            minWidth: 'max-content',
            marginLeft: 'auto',
          }}
        >
          {actions}
        </div>
      )}
    </>
  );
}
