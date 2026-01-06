import React from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Paper, FormLabel } from '@mui/material';
import { CheckIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@mui/material/styles';

const BRAND_TEAL = '#1E6F68';

/**
 * ServicePaymentsTable
 * -----------------------------------------------------------------------------
 * Lightweight reusable table for the Services Payments page(s).
 * - Renders a simple MUI Table with a shared "Actions" column (Mark Paid / Send Email).
 * - Column config is minimal and consistent with other tables in this area.
 *
 * Props:
 *  - title?: string                       // Heading rendered above the table
 *  - serviceKey: 'hoa'|'internet'|'cfe'|'water'|string
 *  - rows: Array<object>
 *  - columns: Array<{
 *      header: string,
 *      accessor?: string,                 // if no render, takes from row[accessor]
 *      align?: 'left'|'center'|'right',
 *      width?: number,
 *      type?: 'text'|'date'|'currency',   // simple local formatting
 *      render?: (row) => React.ReactNode, // custom cell renderer
 *    }>
 *  - onMarkPaid: (row) => void
 *  - onSendEmail?: (row) => void
 */

function formatMoneyEU(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return value == null ? '' : String(value);
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatDDMMYYYY(value) {
  if (!value) return '';
  // Handle yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}-${m}-${y}`;
  }
  // Handle dd-mm-yy or dd-mm-yyyy
  const m1 = value.match(/^(\d{2})-(\d{2})-(\d{2}|\d{4})$/);
  if (m1) {
    const d = m1[1];
    const m = m1[2];
    const y = m1[3].length === 2 ? `20${m1[3]}` : m1[3];
    return `${d}-${m}-${y}`;
  }
  return String(value);
}

function tsForSortUTC(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const dmy = value.match(/^(\d{2})-(\d{2})-(\d{2}|\d{4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? Number(`20${dmy[3]}`) : Number(dmy[3]);
    return Date.UTC(y, Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export default function ServicePaymentsTable({
  title,
  serviceKey,
  rows = [],
  columns = [],
  onMarkPaid,
  onSendEmail,
  containerWidth = 'fit-content',
  containerMaxWidth,
  widthScale = 1,
  dense = false,
  actionsWidth,
  actionsHeaderAlign,
  bodyMaxHeight = '60vh',
}) {
  const theme = useTheme();
  const [completedActions, setCompletedActions] = React.useState({});
  const markActionDone = (row, key) => {
    setCompletedActions(prev => ({ ...prev, [row.id || row._tmpKey || JSON.stringify(row) + key]: true }));
  };
  const isActionDone = (row, key) => {
    const k = row.id || row._tmpKey || JSON.stringify(row) + key;
    const local = completedActions[k];
    if (local) return true;
    if (key === 'mark') return !!row.paid;
    if (key === 'email') return !!row.emailed;
    return false;
  };
  const isEmailApplicable = (row) => {
    return (row.service === 'Aguakan' && row.reference === 'Condo') ||
           (row.service !== 'CFE' && row.service !== 'Internet' && row.service !== 'Aguakan');
  };

  const NOW_START = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const actionsDefaultWidth = Math.round((dense ? 140 : 180) * widthScale);
  const effectiveActionsWidth = typeof actionsWidth === 'number' ? actionsWidth : actionsDefaultWidth;
  const cols = React.useMemo(() => {
    // Ensure a stable copy so we can add trailing Actions
    const base = Array.isArray(columns) ? [...columns] : [];

    // Append Actions column if not provided
    const hasActions = base.some(c => (c.header || '').toLowerCase() === 'actions');
    if (!hasActions) {
      base.push({
        header: 'Actions',
        headerAlign: actionsHeaderAlign || 'center',
        align: 'center',
        width: effectiveActionsWidth,
        render: (row) => {
          // --- Compute due-state colors ---
          const markedDone = isActionDone(row, 'mark');
          let dueState = 'none'; // 'error' | 'warning' | 'none'
          if (!markedDone) {
            const ts = tsForSortUTC(row?.paymentDate);
            if (Number.isFinite(ts)) {
              const daysUntil = Math.floor((ts - NOW_START) / MS_PER_DAY);
              if (daysUntil <= 0) dueState = 'error';
              else if (daysUntil < 3) dueState = 'warning';
            }
          }
          const successGreen = theme.palette.success?.main || '#22c55e';
          const borderClr = markedDone
            ? successGreen
            : (dueState === 'error' ? theme.palette.error.main : (dueState === 'warning' ? theme.palette.warning.main : 'grey'));
          const checkClr = markedDone ? '#FFFFFF' : borderClr;
          const bgClr = markedDone ? successGreen : 'transparent';
          // --- End compute due-state colors ---
          const showEmail = (
            (row.service === 'Aguakan' && row.reference === 'Condo') ||
            (row.service !== 'CFE' && row.service !== 'Internet' && row.service !== 'Aguakan')
          );
          const emailClr = isActionDone(row, 'email')
            ? (theme.palette.success?.main || '#22c55e')
            : 'grey';
          return (
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                justifyContent: 'center',
                pl: showEmail ? 0 : 2,   // Add left padding when only one icon to keep alignment consistent
                pr: showEmail ? 0 : 6.5,   // Optional: small right padding balance
              }}
            >
              <Box
                component="span"
                sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={() => {
                  onMarkPaid && onMarkPaid(row, serviceKey);
                  // Do not mark as done here; parent will update row.paid after successful save
                }}
                title={isActionDone(row, 'mark') ? 'Paid' : 'Mark as paid'}
              >
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: bgClr,
                    border: '1px solid',
                    borderColor: borderClr,
                    transition: 'background-color 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <CheckIcon
                    style={{
                      width: 12,
                      height: 12,
                      color: checkClr,
                    }}
                  />
                </Box>
              </Box>
              {showEmail && (
                <Box
                  component="span"
                  sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <EnvelopeIcon
                    style={{ width: 20, height: 20, color: emailClr }}
                    onClick={() => {
                      onSendEmail && onSendEmail(row, serviceKey);
                      markActionDone(row, 'email');
                    }}
                  />
                </Box>
              )}
            </Box>
          );
        },
      });
    }
    return base;
  }, [columns, onMarkPaid, onSendEmail, serviceKey, effectiveActionsWidth, actionsHeaderAlign, completedActions, theme, NOW_START, MS_PER_DAY]);

  const colW = (w) => (typeof w === 'number' ? `${Math.max(0, Math.round(w * widthScale))}px` : undefined);
  const rowHeight = dense ? 36 : 44;
  const cellPy = dense ? 0.5 : 1;

  // Auto-sort rows by the first date-typed column (ascending), incomplete first, completed last
  const dateCol = React.useMemo(() => cols.find(c => c.type === 'date' && c.accessor), [cols]);
  const sortedRows = React.useMemo(() => {
    if (!Array.isArray(rows)) return [];
    if (!dateCol) return rows;
    const acc = dateCol.accessor;
    const scored = rows.map(r => {
      const marked = isActionDone(r, 'mark');
      const emailNeeded = isEmailApplicable(r);
      const emailed = isActionDone(r, 'email');
      const done = marked && (!emailNeeded || emailed);
      return { r, done, ts: tsForSortUTC(r?.[acc]) };
    });
    scored.sort((a, b) => {
      // Incomplete first (done=false), completed last (done=true)
      if (a.done !== b.done) return a.done - b.done;
      // Then by date ascending
      return a.ts - b.ts;
    });
    return scored.map(s => s.r);
  }, [rows, dateCol, completedActions]);


  return (
    <Paper variant="outlined" sx={{ width: containerWidth === 'fit-content' ? 'max-content' : containerWidth, maxWidth: containerWidth === 'fit-content' ? undefined : containerMaxWidth, pl: 2, pr: 2, pt: 3, pb: 2, borderRadius: 2, position: 'relative', display: 'inline-block' }}>
      {title ? (
        <FormLabel
          component="legend"
          sx={{
            position: 'absolute',
            top: 0,
            left: 16,
            transform: 'translateY(-50%)',
            px: 0.75,
            fontWeight: 600,
            color: 'text.primary',
            bgcolor: 'background.paper',
            lineHeight: 1.2,
          }}
        >
          {title}
        </FormLabel>
      ) : null}

      <TableContainer sx={{ maxHeight: bodyMaxHeight, overflow: 'auto' }}>
        <Table
          stickyHeader
          size="small"
          sx={{
            tableLayout: 'auto',
            width: containerWidth === 'fit-content' ? 'max-content' : '100%',
          }}
        >
          <colgroup>
            {cols.map((c, idx) => (
              <col key={idx} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow sx={{ height: rowHeight }}>
              {cols.map((c, idx) => (
                <TableCell
                  key={idx}
                  align={c.headerAlign || c.align || (c.type === 'currency' ? 'right' : 'left')}
                  sx={{
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    color: 'text.secondary',
                    fontSize: (theme) => theme.typography.caption.fontSize,
                    py: cellPy,
                    pl: 1,
                    pr: 1.875,
                    fontVariantNumeric: c.type === 'currency' ? 'tabular-nums' : undefined,
                    borderLeft: idx === 0 ? 'none' : (theme) => `1px solid ${theme.palette.divider}`,
                    backgroundColor: (theme) => theme.palette.background.paper,
                    zIndex: 1,
                  }}
                >
                  {c.header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Math.max(1, cols.length)} sx={{ color: 'text.secondary' }}>
                  No rows to display.
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row, rIdx) => (
                <TableRow
                  key={rIdx}
                  sx={{
                    height: rowHeight,
                    '&:hover td': {
                      backgroundColor: (theme) => theme.palette.action.hover,
                    },
                  }}
                >
                  {cols.map((c, cIdx) => {
                    let content;
                    if (typeof c.render === 'function') {
                      content = c.render(row);
                    } else if (c.accessor) {
                      const raw = row?.[c.accessor];
                      if (c.type === 'currency') content = formatMoneyEU(raw);
                      else if (c.type === 'date') content = formatDDMMYYYY(raw);
                      else content = raw == null ? '' : String(raw);
                    } else {
                      content = '';
                    }
                    // Coloring rules:
                    // - If fully done (marked paid and, if applicable, emailed) -> TEAL
                    // - Else if not marked and due today/past -> RED
                    // - Else if not marked and within 1-2 days -> ORANGE
                    let highlightColor;
                    try {
                      const marked = isActionDone(row, 'mark');
                      const emailNeeded = isEmailApplicable(row);
                      const emailed = isActionDone(row, 'email');
                      const fullyDone = marked && (!emailNeeded || emailed);
                      if (fullyDone) {
                        // Completed rows: teal text
                        highlightColor = BRAND_TEAL;
                      } else if (!marked) {
                        // Not marked: apply due-date coloring
                        const ts = tsForSortUTC(row?.paymentDate);
                        if (Number.isFinite(ts)) {
                          const daysUntil = Math.floor((ts - NOW_START) / MS_PER_DAY);
                          if (daysUntil <= 0) {
                            // Current date is the same or past the payment date -> RED
                            highlightColor = (theme) => theme.palette.error.main;
                          } else if (daysUntil < 3) {
                            // Current date is within 1-2 days before the payment date -> ORANGE
                            highlightColor = (theme) => theme.palette.warning.main;
                          }
                        }
                      }
                    } catch {}
                    const shouldHighlightCell =
                      !!highlightColor &&
                      (c.accessor === 'unitName' || c.accessor === 'service' || c.accessor === 'paymentDate' || c.accessor === 'reference');
                    return (
                      <TableCell
                        key={cIdx}
                        align={c.align || (c.type === 'currency' ? 'right' : 'left')}
                        sx={{
                          whiteSpace: 'nowrap',
                          py: cellPy,
                          pl: 1,
                          pr: 1.875,
                          fontWeight: c.type === 'currency' ? 700 : undefined,
                          fontVariantNumeric: c.type === 'currency' ? 'tabular-nums' : undefined,
                          borderLeft: cIdx === 0 ? 'none' : (theme) => `1px solid ${theme.palette.divider}`,
                          color: shouldHighlightCell ? highlightColor : undefined,
                        }}
                        title={typeof content === 'string' ? content : undefined}
                      >
                        {content}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

ServicePaymentsTable.propTypes = {
  title: PropTypes.string,
  serviceKey: PropTypes.string.isRequired,
  rows: PropTypes.arrayOf(PropTypes.object),
  columns: PropTypes.arrayOf(PropTypes.shape({
    header: PropTypes.string.isRequired,
    accessor: PropTypes.string,
    align: PropTypes.oneOf(['left', 'center', 'right']),
    width: PropTypes.number,
    type: PropTypes.oneOf(['text', 'date', 'currency']),
    render: PropTypes.func,
  })),
  onMarkPaid: PropTypes.func.isRequired,
  onSendEmail: PropTypes.func,
  containerWidth: PropTypes.string,
  containerMaxWidth: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  widthScale: PropTypes.number,
  dense: PropTypes.bool,
  actionsWidth: PropTypes.number,
  actionsHeaderAlign: PropTypes.oneOf(['left', 'center', 'right']),
  bodyMaxHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
