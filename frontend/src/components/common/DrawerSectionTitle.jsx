import React from 'react';

/**
 * DrawerSectionTitle
 * Simple section label inside drawers (not a tab).
 * - Consistent spacing + divider
 * - Optional rightActions slot
 */
export default function DrawerSectionTitle({
  title,
  rightActions = null,
  style = {},
  titleStyle = {},
}) {
  if (!title) return null;

  return (
    <div style={{
      marginTop: 12,
      marginBottom: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      ...style,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 0.2,
          color: '#111827',
          lineHeight: '20px',
          ...titleStyle,
        }}>
          {title}
        </div>
        <div style={{
          marginTop: 6,
          height: 1,
          background: 'rgba(0,0,0,0.08)',
          width: '100%',
        }} />
      </div>

      {rightActions ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginBottom: 2 }}>
          {rightActions}
        </div>
      ) : null}
    </div>
  );
}
