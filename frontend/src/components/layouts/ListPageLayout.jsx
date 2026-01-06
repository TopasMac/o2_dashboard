import React from 'react';
import Typography from '@mui/material/Typography';
import './ListPageLayout.css';

/**
 * ListPageLayout
 * ----------------
 * A thin, reusable wrapper for list pages (tables).
 * Renders a title, optional “Add +” action, optional extra actions, and your children (e.g., a DataTable).
 *
 * Props:
 * - title: string (required) — page title
 * - description?: string — short helper text under the title
 * - addHref?: string — if provided, shows an <a> “Add +” button linking here
 * - onAdd?: () => void — if provided (and addHref not set), shows a <button> “Add +”
 * - addLabel?: string — override the button label (default: "Add +")
 * - actionsSlot?: ReactNode — render custom actions next to the “Add +” button
 * - children: ReactNode — the page content (e.g., <DataTable />)
 *
 * Styling:
 * - Uses your existing classes: "page-container" and "add-button" (as used in HK pages)
 */
export default function ListPageLayout({
  title,
  description,
  addHref,
  onAdd,
  addLabel = 'Add +',
  actionsSlot,
  children,
  titleVariant = 'h5',
  descriptionVariant = 'body2',
}) {
  return (
    <div className="page-container">
      {/* Header */}
      <div className="list-page-header">
        <div>
          <Typography variant={titleVariant} component="h1" className="list-page-title">
            {title}
          </Typography>
          {description ? (
            <Typography variant={descriptionVariant} className="list-page-description">
              {description}
            </Typography>
          ) : null}
          <div className="list-page-actions">
            {actionsSlot ? <div>{actionsSlot}</div> : null}
            {addHref ? (
              <a href={addHref} className="add-button btn btn-primary">{addLabel}</a>
            ) : onAdd ? (
              <button type="button" className="add-button btn btn-primary" onClick={onAdd}>
                {addLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="list-page-body">
        {children}
      </div>
    </div>
  );
}