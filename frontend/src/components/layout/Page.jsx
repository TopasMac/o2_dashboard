import React, { useId } from 'react';
import PropTypes from 'prop-types';

/**
 * Page – standardized inner page wrapper
 * Provides consistent max width, horizontal gutters, and vertical rhythm.
 * Intended for use inside AppShell or standalone pages.
 * The card wrapper is always enabled and fluid full width by default.
 */
export default function Page({
  title,
  actions,
  children,
  maxWidth = 1240,
  gutterX = 24,
  gutterY = 16,
  background = 'transparent',
  cardPadding = 16,
  cardRadius = 12,
  cardShadow = '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)',
  cardBorder = '1px solid #e6e6e6',
  cardStyle = {},
  align = 'center',
  fluid = true,
  stickyActions,
  stickyFooter,
  stickyActionsHeight = 56,
  stickyFooterHeight = 48,
  enableStickyTable = true,
}) {
  const id = useId();
  const scrollContainerClass = `page-scroll-container-${id}`;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        width: '100%',
        background,
      }}
    >
      <style>{`
        .${scrollContainerClass} thead {
          ${enableStickyTable ? 'position: sticky;' : ''}
          top: ${stickyActions ? stickyActionsHeight : 0}px;
          background: #ffffff;
          z-index: 2;
        }
        .${scrollContainerClass} tfoot {
          ${enableStickyTable ? 'position: sticky;' : ''}
          bottom: ${stickyFooter ? stickyFooterHeight : 0}px;
          background: #ffffff;
          z-index: 2;
        }
      `}</style>
      <div
        style={{
          width: '100%',
          maxWidth: fluid ? '100%' : maxWidth,
          padding: `${gutterY}px ${gutterX}px`,
          boxSizing: 'border-box',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {(title || actions) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {title ? (
              <h1
                style={{
                  margin: 0,
                  fontSize: 24,
                  lineHeight: '32px',
                  fontWeight: 700,
                }}
              >
                {title}
              </h1>
            ) : (
              <span />
            )}
            {actions ? <div style={{ display: 'flex', gap: 8 }}>{actions}</div> : null}
          </div>
        )}
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            width: '100%',
            boxSizing: 'border-box',
            background: '#ffffff',
            borderRadius: cardRadius,
            boxShadow: cardShadow,
            border: cardBorder,
            padding: cardPadding,
            flex: 1,
            minHeight: 0,
            ...cardStyle,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className={scrollContainerClass}
            style={{
              overflow: 'auto',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {stickyActions && (
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  height: stickyActionsHeight,
                  background: '#ffffff',
                  borderBottom: '1px solid #e6e6e6',
                  zIndex: 3,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  paddingRight: 8,
                  boxSizing: 'border-box',
                }}
              >
                {stickyActions}
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
            {stickyFooter && (
              <div
                style={{
                  position: 'sticky',
                  bottom: 0,
                  height: stickyFooterHeight,
                  background: '#ffffff',
                  borderTop: '1px solid #e6e6e6',
                  zIndex: 3,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  paddingRight: 8,
                  boxSizing: 'border-box',
                }}
              >
                {stickyFooter}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Page.propTypes = {
  title: PropTypes.node,
  actions: PropTypes.node,
  children: PropTypes.node,
  maxWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  gutterX: PropTypes.number,
  gutterY: PropTypes.number,
  background: PropTypes.string,
  cardPadding: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  cardRadius: PropTypes.number,
  cardShadow: PropTypes.string,
  cardBorder: PropTypes.string,
  cardStyle: PropTypes.object,
  align: PropTypes.oneOf(['left', 'center']),
  fluid: PropTypes.bool,
  stickyActions: PropTypes.node,
  stickyFooter: PropTypes.node,
  stickyActionsHeight: PropTypes.number,
  stickyFooterHeight: PropTypes.number,
  enableStickyTable: PropTypes.bool,
};
