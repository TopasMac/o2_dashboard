import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import dayjs from 'dayjs';
import api from '../../api';
import BaseModal from '../common/BaseModal';

/**
 * HRDiscountModal
 * Edit a single Employee Ledger row of type "deduction".
 * Editable fields (per backend whitelist): periodStart, periodEnd, notes.
 */
export default function HRDiscountModal({
  open,
  onClose,
  row,
  onSave,
  saving = false,
}) {
  const initial = useMemo(() => {
    const pe = row?.periodEnd ? dayjs(row.periodEnd) : null;
    let month = '';
    let dayKind = 'mid';

    if (pe && pe.isValid()) {
      month = pe.format('YYYY-MM');
      if (pe.date() === 15) {
        dayKind = 'mid';
      } else if (pe.date() === pe.endOf('month').date()) {
        dayKind = 'eom';
      } else {
        // Fallback: treat anything else as EOM (but UI prevents invalid picks anyway)
        dayKind = 'eom';
      }
    }

    return {
      month,
      dayKind,
      notes: row?.notes || '',
    };
  }, [row]);

  const monthOptions = useMemo(() => {
    // Dropdown options: current month through +6 months (inclusive)
    const start = dayjs().startOf('month');
    return Array.from({ length: 7 }, (_, i) => {
      const d = start.add(i, 'month');
      return {
        value: d.format('YYYY-MM'),
        label: d.format('MMMM YYYY'),
      };
    });
  }, []);

  const [month, setMonth] = useState(''); // YYYY-MM
  const [dayKind, setDayKind] = useState('mid'); // 'mid' | 'eom'
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);

  // For editing: prevent selecting a period that already has a deduction for this employee.
  const [existingDeductions, setExistingDeductions] = useState([]);
  const [deductionsLoading, setDeductionsLoading] = useState(false);

  const employeeId = useMemo(() => {
    // API responses sometimes nest employee, while UI tables may flatten employee_id.
    const direct = row?.employee?.id ?? row?.employee_id ?? row?.employeeId ?? null;
    if (direct) return direct;

    // Some views may provide employee as an IRI string like "/api/employees/3".
    const emp = row?.employee;
    if (typeof emp === 'string') {
      const m = emp.match(/\/(\d+)\s*$/);
      if (m) return Number(m[1]);
    }

    // Some views may provide employee_id as a string.
    const eid = row?.employee_id;
    if (typeof eid === 'string' && eid.trim() && /^\d+$/.test(eid.trim())) {
      return Number(eid.trim());
    }

    return null;
  }, [row]);

  const isEditingDeduction = useMemo(() => {
    // We enforce the safeguard only when the modal is used to edit a deduction row.
    // Some table views may not include `id` (e.g., mapped rows), so don't require it here.
    return !!open && String(row?.type || '').toLowerCase() === 'deduction';
  }, [open, row]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Only enforce the safeguard when editing an existing deduction row.
      if (!open) {
        setExistingDeductions([]);
        setDeductionsLoading(false);
        return;
      }

      if (!isEditingDeduction) {
        // Helpful debug: the modal may be opened with a non-deduction row.
        // eslint-disable-next-line no-console
        console.debug('[HRDiscountModal] skip load: not editing deduction', {
          open,
          rowId: row?.id,
          type: row?.type,
        });
        setDeductionsLoading(false);
        return;
      }

      if (!employeeId) {
        // eslint-disable-next-line no-console
        console.debug('[HRDiscountModal] skip load: missing employeeId', {
          row,
        });
        setDeductionsLoading(false);
        return;
      }

      try {
        setDeductionsLoading(true);
        setExistingDeductions([]);

        // eslint-disable-next-line no-console
        console.debug('[HRDiscountModal] loading existing deductions', {
          employeeId,
          rowId: row?.id,
        });

        // Pull a generous set (deductions are not numerous). Filter client-side.
        const res = await api.get('/api/employee-ledger', {
          params: {
            employeeId,
            type: 'deduction',
            limit: 500,
            page: 1,
            sort: 'id',
            dir: 'DESC',
          },
        });

        const rows = Array.isArray(res?.data?.rows) ? res.data.rows : [];
        if (!cancelled) {
          setExistingDeductions(rows);
          setDeductionsLoading(false);
        }
      } catch (e) {
        // Non-blocking: we can still allow save and rely on backend if needed.
        if (!cancelled) {
          setExistingDeductions([]);
          setDeductionsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, row, employeeId, isEditingDeduction]);

  const derivedPeriodStart = useMemo(() => {
    if (!month) return '';
    const m = dayjs(`${month}-01`);
    if (!m.isValid()) return '';

    if (dayKind === 'mid') {
      return m.date(1).format('YYYY-MM-DD');
    }

    // eom
    return m.date(16).format('YYYY-MM-DD');
  }, [month, dayKind]);

  const derivedPeriodEnd = useMemo(() => {
    if (!month) return '';
    const m = dayjs(`${month}-01`);
    if (!m.isValid()) return '';

    if (dayKind === 'mid') {
      return m.date(15).format('YYYY-MM-DD');
    }

    // eom
    return m.endOf('month').format('YYYY-MM-DD');
  }, [month, dayKind]);

  // Detect duplicates by pay-window key (month + mid/eom), not exact start/end equality.
  const findDuplicateFor = useMemo(() => {
    const normalizeDate10 = (v) => {
      if (!v) return '';
      const s = String(v).trim();
      if (!s) return '';

      // Common formats we might see:
      // - "2026-03-01" or "2026-03-01 07:59:33" → take YYYY-MM-DD
      // - "01-03-2026" (table display) → convert to YYYY-MM-DD
      const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;

      const m2 = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
      if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;

      const d = dayjs(s);
      return d.isValid() ? d.format('YYYY-MM-DD') : '';
    };

    const deriveWindowKey = (start, end) => {
      const ns = normalizeDate10(start);
      const ne = normalizeDate10(end);

      const ds = ns ? dayjs(ns) : null;
      const de = ne ? dayjs(ne) : null;

      // Month derived from end if possible (pay window anchor)
      const monthKey = (de && de.isValid())
        ? de.format('YYYY-MM')
        : (ds && ds.isValid())
          ? ds.format('YYYY-MM')
          : '';

      // 1st→15th window => end day is 15; otherwise treat as EOM window.
      const kindKey = (de && de.isValid() && de.date() === 15) ? 'mid' : 'eom';

      return monthKey ? `${monthKey}|${kindKey}` : '';
    };

    return (start, end) => {
      if ((row?.type || '').toLowerCase() !== 'deduction') return null;
      if (!start || !end) return null;

      const targetKey = deriveWindowKey(start, end);
      if (!targetKey) return null;

      return (
        (existingDeductions || []).find((r) => {
          const rid = r?.id;
          const currentId = row?.id;
          if (currentId && rid && String(rid) === String(currentId)) return false;

          const rs = r?.periodStart || r?.period_start || '';
          const re = r?.periodEnd || r?.period_end || '';
          const rowKey = deriveWindowKey(rs, re);

          return rowKey === targetKey;
        }) || null
      );
    };
  }, [existingDeductions, row]);

  const candidateMid = useMemo(() => {
    if (!month) return { start: '', end: '' };
    const m = dayjs(`${month}-01`);
    if (!m.isValid()) return { start: '', end: '' };
    return {
      start: m.date(1).format('YYYY-MM-DD'),
      end: m.date(15).format('YYYY-MM-DD'),
    };
  }, [month]);

  const candidateEom = useMemo(() => {
    if (!month) return { start: '', end: '' };
    const m = dayjs(`${month}-01`);
    if (!m.isValid()) return { start: '', end: '' };
    return {
      start: m.date(16).format('YYYY-MM-DD'),
      end: m.endOf('month').format('YYYY-MM-DD'),
    };
  }, [month]);

  const duplicateMid = useMemo(() => {
    return findDuplicateFor(candidateMid.start, candidateMid.end);
  }, [findDuplicateFor, candidateMid]);

  const duplicateEom = useMemo(() => {
    return findDuplicateFor(candidateEom.start, candidateEom.end);
  }, [findDuplicateFor, candidateEom]);

  const duplicateSelected = useMemo(() => {
    if (!month) return null;
    return dayKind === 'mid' ? duplicateMid : duplicateEom;
  }, [dayKind, duplicateMid, duplicateEom, month]);

  useEffect(() => {
    if (!open) return;
    const initialMonth = initial.month;
    const allowed = new Set(monthOptions.map((o) => o.value));
    const fallback = monthOptions[0]?.value || '';
    setMonth(allowed.has(initialMonth) ? initialMonth : fallback);
    setDayKind(initial.dayKind);
    setNotes(initial.notes);
    setError(null);
  }, [initial, open, monthOptions]);

  const canSave = useMemo(() => {
    if (deductionsLoading) return false;
    if (!month) return false;
    const m = dayjs(`${month}-01`);
    if (!m.isValid()) return false;
    if (!derivedPeriodStart || !derivedPeriodEnd) return false;
    if (duplicateSelected) return false;
    return true;
  }, [month, derivedPeriodStart, derivedPeriodEnd, duplicateSelected, deductionsLoading]);

  const handleSave = async () => {
    setError(null);

    if (deductionsLoading) {
      setError('Loading existing deductions for this employee. Please wait a moment and try again.');
      return;
    }

    if (!row?.id) {
      setError('Missing row id.');
      return;
    }

    if (!month) {
      setError('Please choose a month.');
      return;
    }

    if (!canSave) {
      if (duplicateSelected) {
        const code = duplicateSelected?.code ? String(duplicateSelected.code) : '';
        setError(
          `This employee already has a deduction for this pay period${code ? ` (${code})` : ''}. Please choose a different period.`
        );
      } else {
        setError('Please choose a month and a pay date (15th or end of month).');
      }
      return;
    }

    const payload = {
      periodStart: derivedPeriodStart,
      periodEnd: derivedPeriodEnd,
      notes: (notes ?? '').trim() || null,
    };

    try {
      await onSave?.(row, payload);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to save changes.';
      setError(msg);
    }
  };

  const shortName = row?.employeeShortName || row?.employee_shortname || row?.employee?.shortName || row?.employee?.short_name || '';
  const title = row?.code
    ? `Edit deduction ${row.code}${shortName ? ` · ${shortName}` : ''}`
    : `Edit deduction${shortName ? ` · ${shortName}` : ''}`;

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      draggable
      actions={
        <Stack direction="row" spacing={1}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={!!saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={!canSave || !!saving || !!deductionsLoading}
          >
            Save
          </button>
        </Stack>
      }
    >
      <Stack spacing={2}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <FormControl fullWidth size="small">
              <InputLabel id="hr-discount-month-label">Month</InputLabel>
              <Select
                labelId="hr-discount-month-label"
                value={month}
                label="Month"
                onChange={(e) => setMonth(e.target.value)}
              >
                {monthOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button
                variant={dayKind === 'mid' ? 'contained' : 'outlined'}
                onClick={() => setDayKind('mid')}
                disabled={!month || saving || deductionsLoading || !!duplicateMid}
              >
                15th
              </Button>
              <Button
                variant={dayKind === 'eom' ? 'contained' : 'outlined'}
                onClick={() => setDayKind('eom')}
                disabled={!month || saving || deductionsLoading || !!duplicateEom}
              >
                EOM
              </Button>
            </Stack>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField
              label="Amount"
              value={(() => {
                const raw = row?.amount ?? row?.Amount ?? '';
                const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
                if (!Number.isFinite(n)) return String(raw || '');
                try {
                  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
                } catch {
                  return String(n);
                }
              })()}
              size="small"
              disabled
              sx={{ flex: 1 }}
            />

            {/* spacer to match the width of the pay-date buttons row */}
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0, visibility: 'hidden' }}>
              <Button variant="outlined" disabled>
                15th
              </Button>
              <Button variant="outlined" disabled>
                EOM
              </Button>
            </Stack>
          </Stack>
        </Stack>

        <TextField
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          placeholder='Optional (e.g., "Loan repayment 3/5")'
        />

        {error ? (
          <Box sx={{ color: 'error.main', fontSize: 13 }}>
            {String(error)}
          </Box>
        ) : null}
      </Stack>
    </BaseModal>
  );
}