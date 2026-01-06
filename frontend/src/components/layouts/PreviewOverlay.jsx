import React, { useEffect, useRef } from 'react';

export default function PreviewOverlay({ open, onClose, title = 'Preview', newTabHref, onOpenNewTab, children }) {
  const didLockRef = useRef(false);

  useEffect(() => {
    const LOCK_KEY = '__o2_scrollLocks';
    const PREV_KEY = '__o2_prevOverflow';
    const w = typeof window !== 'undefined' ? window : {};
    const doc = typeof document !== 'undefined' ? document : null;

    const inc = () => {
      w[LOCK_KEY] = (w[LOCK_KEY] || 0) + 1;
      if (w[LOCK_KEY] === 1 && doc) {
        w[PREV_KEY] = doc.body.style.overflow;
        doc.body.style.overflow = 'hidden';
      }
    };
    const dec = () => {
      w[LOCK_KEY] = Math.max(0, (w[LOCK_KEY] || 0) - 1);
      if (w[LOCK_KEY] === 0 && doc) {
        doc.body.style.overflow = w[PREV_KEY] || '';
        delete w[PREV_KEY];
      }
    };

    if (open && !didLockRef.current) {
      inc();
      didLockRef.current = true;
      const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('keydown', onKey);
        if (didLockRef.current) {
          dec();
          didLockRef.current = false;
        }
      };
    }

    // Ensure we release any previous lock if open becomes false
    return () => {
      if (didLockRef.current) {
        dec();
        didLockRef.current = false;
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      aria-modal="true"
      role="dialog"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 10,
          width: '80vw',
          height: '80vh',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{
            fontWeight: 600,
            fontSize: 14,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }} title={title}>
            {title}
          </div>
          {(onOpenNewTab || newTabHref) ? (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenNewTab ? onOpenNewTab() : (newTabHref && window.open(newTabHref, '_blank', 'noopener')); }}
              aria-label="Print"
              title="Print"
              style={{
                background: 'transparent',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                fontWeight: 600,
                marginRight: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 12 }}>Print</span>
            </button>
          ) : null}
          <button
            onClick={onClose}
            aria-label="Close preview"
            style={{
              background: 'transparent',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            <span style={{ fontSize: 14 }}>X</span>
          </button>
        </div>
        <div style={{ flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}