import React, { useEffect } from 'react';
import { Drawer, Box } from '@mui/material';
import { useTheme, useMediaQuery } from '@mui/material';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

/**
 * AppDrawer
 * - Full-screen on mobile (xs) by default
 * - Size presets for wider screens
 *
 * Props:
 *  - size: 'default' | 'large' | 'compact' | 'document' (controls width on sm+)
 *  - fullScreenOnMobile: boolean (default true)
 *  - ...props: forwarded to MUI <Drawer>
 *  - formId?: string (HTML form id to target the Save submit button)
 *  - showActions?: boolean (render standardized Save/Cancel/Delete footer)
 *  - actions?: { saveLabel?, cancelLabel?, deleteLabel?, showDelete?, showSave? }
 *  - extraActions?: React node (additional actions to render in footer)
 *  - onDelete?: function (called when Delete is clicked)
 *  - mode?: 'create' | 'edit' (optional; controls default action layout)
 */
export default function AppDrawer({ size = 'default', fullScreenOnMobile = true, mobileVariant = 'fullscreen', title, hideHeader = false, headerLink, formId, showActions = false, mode, actions = {}, extraActions, onDelete, contentSx = {}, ...props }) {
  const presets = {
    compact: { sm: 420, md: 420 },
    default: { sm: 420, md: 420 },
    large: { sm: 440, md: 520 },
    document: { sm: 900, md: 960 },
  };

  const preset = presets[size] || presets.default;

  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const isSheet = isXs && mobileVariant === 'sheet';
  const drawerAnchor = isSheet ? 'bottom' : 'right';

  const [actionsWidth, setActionsWidth] = React.useState(null);
  React.useEffect(() => {
    if (!showActions || !formId) return;
    let frame = null;
    const measure = () => {
      try {
        const el = document.getElementById(formId);
        if (el) {
          const w = el.getBoundingClientRect().width;
          if (w && Math.abs(w - (actionsWidth || 0)) > 1) {
            setActionsWidth(w);
          }
        }
      } catch {}
    };
    measure();
    // Re-measure on resize and after layout settles
    const onResize = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    // a couple staged measures to catch async content
    frame = requestAnimationFrame(() => {
      measure();
      setTimeout(measure, 50);
      setTimeout(measure, 150);
    });
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [showActions, formId, props.open]); // re-run when drawer opens

  const paperClass = `o2-drawer o2-drawer--${size}`;

  // Ref-counted scroll lock so multiple overlays/drawers don't fight
  useEffect(() => {
    if (!props.open) return;

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

    inc();
    return () => dec();
  }, [props.open]);

  const resolvedMode = mode || ((actions.showDelete === true || typeof onDelete === 'function') ? 'edit' : 'create');
  const shouldShowDelete = resolvedMode === 'edit' && (actions.showDelete === true || typeof onDelete === 'function');

  return (
    <Drawer
      anchor={drawerAnchor}
      onClose={(event, reason) => {
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

        // 2) Notify listeners immediately (e.g., DataTable) to blur/reset
        try { window.dispatchEvent(new Event('app:drawerClosed')); } catch {}

        // 3) Now invoke parent's onClose (which may unmount stateful children)
        if (typeof props.onClose === 'function') {
          props.onClose(event, reason);
        }

        // 4) Final safety scroll after parent state changes
        try {
          const finalScroll = () => { try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {}; };
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finalScroll); else setTimeout(finalScroll, 0);
        } catch {}
      }}
      ModalProps={{
        keepMounted: true,
        disableRestoreFocus: true,
        disableAutoFocus: true,
        disableEnforceFocus: true,
        BackdropProps: {
          sx: {
            top: { xs: 0, sm: 0 },
            height: { xs: '100vh', sm: '100vh' },
            backgroundColor: 'transparent',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          },
        },
      }}
      PaperProps={{
        sx: {
          // Full screen on phones for easier interaction
          width: { xs: isSheet ? '100vw' : (fullScreenOnMobile ? '100vw' : 'min(92vw, 520px)'), sm: preset.sm, md: preset.md },
          height: { xs: isSheet ? '85vh' : (fullScreenOnMobile ? '100vh' : 'auto'), sm: '100vh' },
          maxWidth: '100vw',
          boxSizing: 'border-box',
          // Avoid rounded edge seams when full-screen
          borderRadius: { xs: isSheet ? '12px 12px 0 0' : 0, sm: 0 },
          // Let inner content scroll if it overflows
          overflowX: 'hidden', overflowY: 'hidden',
          // Remove global horizontal padding, handled in content wrapper
          px: 0,
          // Margin top for desktop screens to start below the header
          mt: { xs: 0, sm: 0 },
          // Flex column for header + scrollable content
          display: 'flex',
          flexDirection: 'column',
          // Force anchor-right positioning (defensive, in case any global css interferes)
          ml: 'auto',
          left: 'auto !important',
          right: 0,
          // Frosted glass look
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)', // Safari
          backgroundColor: 'transparent', // no tint
          border: 'none',
          boxShadow: 'none',
          position: 'relative',
          '&::before': isSheet ? {} : {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '12px',
            height: '100%',
            background: 'linear-gradient(to right, rgba(0,0,0,0.1), transparent)',
            pointerEvents: 'none',
          },
        },
        className: paperClass,
      }}
      {...props}
    >
      {!hideHeader && (
        <div style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 56,
          padding: '0 24px',
          backgroundColor: 'transparent',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          boxSizing: 'border-box',
        }}>
          <div style={{
            fontSize: 20,
            lineHeight: '28px',
            fontWeight: 700,
            color: '#ffffff',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {title || ''}
          </div>
          <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {headerLink && (
              <a
                href={headerLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in new tab"
                title="Open in new tab"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, color: '#1E6F68'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <ArrowTopRightOnSquareIcon style={{ width: 20, height: 20, color: '#1E6F68' }} />
              </a>
            )}
          </div>
        </div>
      )}
      <Box
        sx={{
          pt: 0.5,
          px: 2,
          pb: 2,
          gap: 1.5,
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          ...contentSx,
        }}
      >
        {props.open ? props.children : null}
      </Box>
      {showActions && (
        <div
          className="form-actions"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'sticky',
            bottom: 0,
            background: 'rgba(255,255,255,0.6)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            padding: '12px 24px 12px 12px', // reduced left padding
            borderTop: '1px solid rgba(0,0,0,0.06)',
            zIndex: 2,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{
            width: actionsWidth ? Math.max(0, actionsWidth - 16) : '100%',
            margin: '0 auto',
            paddingRight: 16, // ensure rightmost button is never clipped
            boxSizing: 'border-box',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            columnGap: 12
          }}>
            <div className="form-actions__left" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {(actions.showSave !== false) && (
                <button
                  type="submit"
                  form={formId}
                  className="btn btn-primary"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {actions.saveLabel || 'Save'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { if (typeof props.onClose === 'function') props.onClose(e, 'cancel'); }}
              >
                {actions.cancelLabel || 'Cancel'}
              </button>
            </div>
            <div className="form-actions__right" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {shouldShowDelete && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={(e) => { if (typeof onDelete === 'function') onDelete(e); }}
                >
                  {actions.deleteLabel || 'Delete'}
                </button>
              )}
              {extraActions ? (
                <div className="form-actions__extra">
                  {extraActions}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
