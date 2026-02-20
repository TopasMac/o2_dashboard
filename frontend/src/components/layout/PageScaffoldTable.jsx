import React from 'react';
import PageScaffold from './PageScaffold';

/**
 * PageScaffoldTable
 *
 * Internal rule:
 * All pages rendering TableLite must use this wrapper
 * to ensure consistent spacing and stickyHeader behavior.
 *
 * This enforces:
 * - layout="table"
 * - stickyHeader rendered with "inside" placement (default for table layout)
 *
 * Usage:
 *
 * <PageScaffoldTable stickyHeader={...}>
 *   <TableLite ... />
 * </PageScaffoldTable>
 */

export default function PageScaffoldTable({ children, ...props }) {
  return (
    <PageScaffold
      layout="table"
      {...props}
    >
      {children}
    </PageScaffold>
  );
}
