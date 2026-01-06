import React from 'react';
import AppDrawer from './AppDrawer';

/**
 * Generic wrapper for showing any form inside a drawer.
 * Usage:
 * <FormDrawer open={open} onClose={onClose} title="Edit Client">
 *   <EditClientForm clientId={id} onClose={onClose} />
 * </FormDrawer>
 */
export default function FormDrawer({ open, onClose, title, children, width, showHeader = false }) {
  const handleClose = (event, reason) => {
    // 0) Blur any focused element to avoid autofocus-driven scroll
    try {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    } catch {}

    // 1) Pre-scroll all likely containers to top BEFORE parent state updates
    try {
      const scrollAll = () => {
        try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
        const candidates = [];
        try { candidates.push(document.scrollingElement); } catch {}
        try { candidates.push(document.documentElement); } catch {}
        try { candidates.push(document.body); } catch {}
        try { const el = document.querySelector('#app-content'); if (el) candidates.push(el); } catch {}
        try { const el = document.querySelector('main'); if (el) candidates.push(el); } catch {}
        try { const el = document.querySelector('.app-content'); if (el) candidates.push(el); } catch {}
        try { const el = document.querySelector('[data-scroll-container]'); if (el) candidates.push(el); } catch {}
        candidates.filter(Boolean).forEach((el) => { try { el.scrollTop = 0; } catch {} });
      };
      scrollAll();
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(scrollAll);
        requestAnimationFrame(() => setTimeout(scrollAll, 0));
      } else {
        setTimeout(scrollAll, 0);
      }
      setTimeout(scrollAll, 200);
    } catch {}

    // 2) Notify listeners immediately so tables can blur/reset
    try { window.dispatchEvent(new Event('app:drawerClosed')); } catch {}

    // 3) Now call the provided onClose
    if (typeof onClose === 'function') {
      try { onClose(event, reason); } catch (_) {}
    }

    // 4) Final safety scroll after parent state changes
    try {
      const finalScroll = () => { try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {}; };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finalScroll); else setTimeout(finalScroll, 0);
    } catch {}
  };

  return (
    <AppDrawer
      open={open}
      onClose={handleClose}
      title={showHeader ? title : undefined}
      width={width || 480}
    >
      {children}
    </AppDrawer>
  );
}