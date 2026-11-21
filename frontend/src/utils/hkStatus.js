export const HK_STATUS_COLORS = {
  pending: '#6b7280', // grey
  done: '#1e6f68', // teal
  reported: '#1976d2', // blue
  needs_review: '#f97316', // orange
  cancelled: '#d32f2f', // red
};

export const HK_STATUS_LABELS = {
  pending: 'Pending',
  done: 'Done',
  reported: 'Reported',
  needs_review: 'Needs review',
  cancelled: 'Cancelled',
};

const normalizeReportStatus = (v) => {
  const lower = (v ?? '').toString().trim().toLowerCase();
  if (lower === 'reported') return 'reported';
  if (lower === 'needs_review' || lower === 'needs review') return 'needs_review';
  return 'pending';
};

// Playa del Carmen rows carry `display_status` from the API (null for other cities).
// For other cities fall back to the report status, as before.
export function resolveHkStatus(row) {
  const display = (row?.display_status ?? row?.displayStatus ?? '').toString().trim();
  if (display) return display;
  return normalizeReportStatus(row?.report_status ?? row?.reportStatus);
}

// Status when a user picks a dropdown value in HK Reconciliation: Pending/Done are automatic,
// so choosing either one clears the manual report status.
export function reportStatusFromChoice(choice) {
  return choice === 'reported' || choice === 'needs_review' ? choice : 'pending';
}

export function displayStatusAfterChoice(row, choice) {
  const report = reportStatusFromChoice(choice);
  if (report !== 'pending') return report;
  return (row?.status ?? '').toString().toLowerCase() === 'done' ? 'done' : 'pending';
}
