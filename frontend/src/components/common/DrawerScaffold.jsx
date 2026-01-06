import React from 'react';

/**
 * DrawerScaffold
 * - Standardized drawer layout wrapper
 * - Body slot via children
 * - Optional sticky footer slot
 */
export default function DrawerScaffold({
  children,
  bodyPadding = 16,
  maxContentWidth = '100%',
  fullBleed = false,
  footer = null,
  footerSticky = true,
}) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: `${bodyPadding}px ${Math.max(12, bodyPadding)}px`,
          background: 'transparent',
        }}
      >
        <div style={{ maxWidth: maxContentWidth, margin: '0 auto' }}>
          {children}
        </div>
      </div>

      {footer ? (
        <div
          style={{
            borderTop: '1px solid #e5e7eb',
            background: '#fff',
            padding: '12px 16px',
            position: footerSticky ? 'sticky' : 'static',
            bottom: footerSticky ? 0 : undefined,
            zIndex: 2,
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}