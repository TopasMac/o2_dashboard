import React, { useEffect, useLayoutEffect, useRef } from 'react';
import SectionHeader from './SectionHeader';
import AppShell from './AppShell';

/**
 * PageScaffold
 *
 * Props:
 *  - title: string (optional label in the white card)
 *  - sectionKey: string (for SectionHeader group nav)
 *  - currentPath: string (for SectionHeader selection)
 *  - stickyHeader: ReactNode (actions/filters)
 *  - stickyFooter: ReactNode (e.g., pager)
 *  - children: page content
 *  - withCard: boolean (whether to render the inner white card, default true)
 *  - maxCardHeight: string (max height of the card container)
 *  - layout: 'standard' | 'table' (table defaults move sticky header inside scroll)
 *  - stickyHeaderPlacement: 'inside' | 'outside' (override default per layout)
 *  - contentPadding: number | string (padding inside the scroll area)
 *  - stickyGap: number (px gap below sticky actions when placed inside scroll, default 12 for table layout)
 *  - footerHeight: number (height of sticky footer, default 40)
 *  - footerBottom: number (bottom gap of sticky footer, default 4)
 *  - footerReserve: number (reserved space to visually tuck footer closer to card edge, default 8)
 *  - hideCardTitle: boolean (suppress the inside-card title block while keeping AppShell title)
 */
const PageScaffold = ({
  title,
  sectionKey,
  currentPath,
  stickyHeader,
  stickyFooter,
  children,
  withCard = true,
  maxCardHeight = 'calc(100vh - 160px)',
  layout = 'standard',
  stickyHeaderPlacement = undefined,
  contentPadding = 16,
  stickyGap = 12,
  footerHeight = 40,
  footerBottom = 12,
  footerReserve = 20,
  hideCardTitle = false,
}) => {
  const rootRef = useRef(null);
  const stickyRef = useRef(null);
  const footerRef = useRef(null);
  const normalizedStickyHeader = React.useMemo(() => {
    if (!stickyHeader) return null;
    if (React.isValidElement(stickyHeader)) {
      const existingStyle = stickyHeader.props?.style || {};
      return React.cloneElement(stickyHeader, {
        style: {
          ...existingStyle,
          flexWrap: 'nowrap',
          whiteSpace: 'nowrap',
        },
      });
    }
    return stickyHeader;
  }, [stickyHeader]);

  const contentPaddingValue = typeof contentPadding === 'number' ? `${contentPadding}px` : String(contentPadding);

  // Derive placement defaults from layout
  const isTableLayout = layout === 'table';
  const headerPlacement = stickyHeaderPlacement || (isTableLayout ? 'inside' : 'outside');

  const stickyWrapperPaddingTop = headerPlacement === 'inside' ? '2px' : contentPaddingValue;

  let scrollPaddingBottom;
  if (!stickyFooter) {
    // No sticky footer: just give content some breathing room at the bottom
    scrollPaddingBottom = `calc(${contentPaddingValue} + 20px)`;
  } else if (isTableLayout) {
    // Table layout with pager/footer inside the card
    scrollPaddingBottom = `calc(${contentPaddingValue} + 20px)`;
  } else {
    // Standard layout with sticky footer using the CSS vars
    scrollPaddingBottom = `calc(max(0px, calc(var(--page-footer-height, 40px)
            + var(--page-footer-bottom, 0px)
            - var(--page-footer-reserve, 36px))) + 20px)`;
  }

  // Initialize the CSS vars (so consumers have a sane default even with no sticky content)
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (el) {
      el.style.setProperty('--page-sticky-offset', '0px');
      el.style.setProperty('--page-footer-height', `${footerHeight}px`);
      el.style.setProperty('--page-footer-bottom', `${footerBottom}px`);
      el.style.setProperty('--page-footer-reserve', `${footerReserve}px`);
    }
  }, [footerHeight, footerBottom, footerReserve]);

  // Observe sticky header height — works for 0, 1, or many rows of actions
  useEffect(() => {
    const rootEl = rootRef.current;
    const targetEl = stickyRef.current;
    if (!rootEl) return;

    const update = () => {
      const h = targetEl ? Math.round(targetEl.getBoundingClientRect().height) : 0;
      rootEl.style.setProperty('--page-sticky-offset', `${h}px`);
    };

    update();

    let ro;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(update);
      if (targetEl) ro.observe(targetEl);
    } else {
      window.addEventListener('resize', update);
    }

    return () => {
      if (ro && targetEl) ro.unobserve(targetEl);
      window.removeEventListener('resize', update);
    };
  }, [stickyHeader]);

  // Observe sticky footer height — update CSS var for footer height
  useEffect(() => {
    const rootEl = rootRef.current;
    const targetEl = footerRef.current;
    if (!rootEl) return;

    const update = () => {
      const h = targetEl ? Math.round(targetEl.getBoundingClientRect().height) : footerHeight;
      rootEl.style.setProperty('--page-footer-height', `${h}px`);
    };

    update();

    let ro;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(update);
      if (targetEl) ro.observe(targetEl);
    } else {
      window.addEventListener('resize', update);
    }

    return () => {
      if (ro && targetEl) ro.unobserve(targetEl);
      window.removeEventListener('resize', update);
    };
  }, [stickyFooter, footerHeight]);

  return (
    <AppShell title={title} withCard={false}>
      <div
        ref={rootRef}
        style={{
          background: 'transparent',
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >

        {/* Content container (card or plain) */}
        {withCard ? (
          // White card version (default)
          <div
            style={{
              width: '100%',
              margin: '16px 0 0',
              padding: 0, // outer padding handled by inner scroll area via contentPadding
              boxSizing: 'border-box',
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)',
              border: '1px solid #e6e6e6',
              display: 'flex',
              flexDirection: 'column',
              height: maxCardHeight, // fixed card height across pages (independent of AppShell outer height var)
              overflow: 'hidden', // clip to card; inner content area is the scroll owner
            }}
          >
            {/* Sticky actions/filters bar (outside scroll) */}
            {normalizedStickyHeader && headerPlacement === 'outside' && (
              <div
                ref={stickyRef}
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  background: '#fff',
                  borderBottom: 'none',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    flexWrap: 'nowrap',
                    alignItems: 'center',
                    gap: 12,
                    minWidth: 'max-content',
                  }}
                >
                  {normalizedStickyHeader}
                </div>
              </div>
            )}

            {/* Optional title inside the card (above scroll) */}
            {title && layout !== 'table' && !hideCardTitle && (
              <div style={{ padding: '14px 16px 8px', fontWeight: 600, color: '#333' }}>
                {title}
              </div>
            )}

            {/* Scrollable content area (single scroll owner) */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto', WebkitOverflowScrolling: 'touch',
                padding: `8px ${contentPadding}px 20px`,
                paddingBottom: scrollPaddingBottom,
                background: '#fff',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                overscrollBehavior: 'contain',
                '--page-card-content-pb': contentPaddingValue,
                '--page-content-padding-bottom': isTableLayout ? '0px' : contentPaddingValue,
              }}
            >
              {/* Sticky header INSIDE the scroll, for table pages */}
              {normalizedStickyHeader && headerPlacement === 'inside' && (
                <div style={{ paddingTop: stickyWrapperPaddingTop }}>
                  <div
                    ref={stickyRef}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      background: '#fff',
                      paddingTop: contentPaddingValue,
                      paddingLeft: contentPaddingValue,
                      paddingRight: contentPaddingValue,
                      marginBottom: stickyGap,
                      overflowX: 'auto',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        flexWrap: 'nowrap',
                        alignItems: 'center',
                        gap: 12,
                        minWidth: 'max-content',
                      }}
                    >
                      {normalizedStickyHeader}
                    </div>
                  </div>
                </div>
              )}

              {/* Children come next (e.g., table body) */}
              <div style={{ flex: 1, minHeight: 0 }}>
                {children}
              </div>

              {/* Sticky footer inside the scroll (e.g., table pager) */}
              {stickyFooter && (
                <div
                  ref={footerRef}
                  style={{
                    position: 'sticky',
                    bottom: isTableLayout ? '0' : 'max(0px, calc(var(--page-footer-bottom, 0px) - var(--page-footer-reserve, 20px)))',
                    zIndex: 10,
                    background: '#fff',
                  }}
                >
                  {stickyFooter}
                </div>
              )}
            </div>
          </div>
        ) : (
          // Plain container (no card) — lets inner content (e.g., a table) provide its own chrome
          <div
            style={{
              width: 'var(--app-shell-max-width, min(1200px, 96vw))',
              margin: '12px auto 0',
              paddingInline: 8,
              boxSizing: 'border-box',
            }}
          >
            {/* Sticky header OUTSIDE scroll (plain layout) */}
            {normalizedStickyHeader && headerPlacement === 'outside' && (
              <div
                ref={stickyRef}
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  background: '#fff',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    flexWrap: 'nowrap',
                    alignItems: 'center',
                    gap: 12,
                    minWidth: 'max-content',
                  }}
                >
                  {normalizedStickyHeader}
                </div>
              </div>
            )}

            {title && layout !== 'table' && !hideCardTitle && (
              <div style={{ margin: '0 0 8px 0', fontWeight: 600, color: '#333' }}>
                {title}
              </div>
            )}

            {/* Single scroll owner for plain mode as well */}
            <div style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              paddingBottom: scrollPaddingBottom,
              overscrollBehavior: 'contain',
              '--page-card-content-pb': contentPaddingValue,
              '--page-content-padding-bottom': isTableLayout ? '0px' : contentPaddingValue,
              padding: `8px ${contentPadding}px 20px`,
            }}>
              {normalizedStickyHeader && headerPlacement === 'inside' && (
                <div style={{ paddingTop: stickyWrapperPaddingTop }}>
                  <div
                    ref={stickyRef}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      background: '#fff',
                      paddingTop: contentPaddingValue,
                      marginBottom: stickyGap,
                      overflowX: 'auto',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        flexWrap: 'nowrap',
                        alignItems: 'center',
                        gap: 12,
                        minWidth: 'max-content',
                      }}
                    >
                      {normalizedStickyHeader}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ flex: 1, minHeight: 0 }}>
                {children}
              </div>

              {stickyFooter && (
                <div
                  ref={footerRef}
                  style={{
                    position: 'sticky',
                    bottom: isTableLayout ? '0' : 'max(0px, calc(var(--page-footer-bottom, 0px) - var(--page-footer-reserve, 20px)))',
                    zIndex: 10,
                    background: '#fff',
                  }}
                >
                  {stickyFooter}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default PageScaffold;
