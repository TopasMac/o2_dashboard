import { useCallback, useState } from 'react';

/** Zero-based pages. Callers filter and sort rows before passing them here.
 * Change resetKey for a new filter or sort, including when results stay identical.
 */
export default function useClientTablePagination({ rows, pageSize = 25, resetKey = '' }) {
  const [selection, setSelection] = useState({ page: 0, resetKey });
  const total = rows.length;
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.max(0, Math.min(
    selection.resetKey === resetKey ? selection.page : 0,
    Math.max(0, totalPages - 1),
  ));
  // Persist resets/clamps so growing the dataset cannot restore a stale page.
  if (selection.page !== page || selection.resetKey !== resetKey) {
    setSelection({ page, resetKey });
  }
  const onPageChange = useCallback((nextPage) => {
    setSelection((previous) => previous.page === nextPage && previous.resetKey === resetKey
      ? previous : { page: nextPage, resetKey });
  }, [resetKey]);

  return {
    rows: rows.slice(page * pageSize, (page + 1) * pageSize),
    page, pageSize, total, totalPages, onPageChange,
  };
}
