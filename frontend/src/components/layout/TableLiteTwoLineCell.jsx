import React from 'react';
import PropTypes from 'prop-types';

/**
 * TableLiteTwoLineCell
 *
 * Supports two usage styles:
 *
 * NEW (preferred):
 *  <TableLiteTwoLineCell
 *    variant="code" | "meta"
 *    main={...}
 *    sub={...}
 *    onSubClick={() => {}}
 *    subTitle="..."
 *  />
 *
 * LEGACY (kept for compatibility):
 *  <TwoLineCell primary={...} meta={...} onMetaClick={...} metaTitle="..." />
 */
export default function TableLiteTwoLineCell(props) {
  const {
    // New API
    variant,
    main,
    sub,
    onSubClick,
    subTitle,

    // Legacy API (aliases)
    primary,
    meta,
    onMetaClick,
    metaTitle,

    className = '',
  } = props;

  const resolvedMain = main ?? primary;
  const resolvedSub = sub ?? meta;
  const resolvedOnSubClick = onSubClick ?? onMetaClick;
  const resolvedSubTitle = subTitle ?? metaTitle;

  const clickable = typeof resolvedOnSubClick === 'function';
  const v = (variant || (clickable ? 'code' : 'meta')).toString();

  return (
    <div
      className={[
        // Base two-line cell
        'o2-cell-two-line',
        // New variant hook (future-proof)
        `o2-two-line--${v}`,
        // Legacy clickable hook (used by existing CSS)
        clickable ? 'o2-two-line-click' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Main line */}
      <div className="o2-two-line__main o2-cell-primary">
        {resolvedMain ?? '—'}
      </div>

      {/* Sub line */}
      <div
        className="o2-two-line__sub o2-cell-meta"
        title={resolvedSubTitle || (clickable ? 'Open' : '')}
        onClick={clickable ? resolvedOnSubClick : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') resolvedOnSubClick(e);
              }
            : undefined
        }
      >
        {resolvedSub ?? '—'}
      </div>
    </div>
  );
}

TableLiteTwoLineCell.propTypes = {
  // New API
  variant: PropTypes.oneOf(['code', 'meta']),
  main: PropTypes.node,
  sub: PropTypes.node,
  onSubClick: PropTypes.func,
  subTitle: PropTypes.string,

  // Legacy API
  primary: PropTypes.node,
  meta: PropTypes.node,
  onMetaClick: PropTypes.func,
  metaTitle: PropTypes.string,

  className: PropTypes.string,
};