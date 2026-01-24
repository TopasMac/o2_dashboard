import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, Box, Stack, Typography, Button, Divider, FormControl, InputLabel, Select, MenuItem, FormHelperText, Alert, CircularProgress, Checkbox, TextField, ToggleButtonGroup, ToggleButton } from '@mui/material';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import api from '../../api';

/**
 * HRPaymentDrawer (Step 1 – Scaffold)
 * Props:
 *  - open: boolean (controls drawer visibility)
 *  - onClose: function () => void
 *
 * Internal state (initialized only):
 *  - division: string
 *  - employees: array
 *  - selectedAmounts: { [employeeId: string]: number }
 */
const HRPaymentDrawer = ({ open = false, onClose }) => {
  // Division used for export filename/template. Deductions are loaded across all divisions.
  // If selected employees span multiple divisions, we label it as 'Mixed'.
  const [division, setDivision] = useState('Housekeepers');
  const [employees, setEmployees] = useState([]);
  const [selectedAmounts, setSelectedAmounts] = useState({});
  // Track which employee amounts were auto-filled (so we can re-calc on period changes without overwriting manual edits)
  const autoAmountIdsRef = useRef(new Set());
  // --- Deductions state ---
  const [deductionsByEmployeeId, setDeductionsByEmployeeId] = useState({});
  const [loadingDeductions, setLoadingDeductions] = useState(false);
  const [deductionsError, setDeductionsError] = useState(null);

  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeesError, setEmployeesError] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Pay period selector (semi-monthly) + optional custom date override
  const [periodHalf, setPeriodHalf] = useState('H1'); // H1 = 1–15, H2 = 16–EOM
  const [customDates, setCustomDates] = useState(false);
  const [periodMonth, setPeriodMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (date) => {
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    return `${y}-${m}-${d}`;
  };
  const endOfMonthYmd = (date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    // Day 0 of next month = last day of current month
    const dt = new Date(y, m + 1, 0);
    return ymd(dt);
  };
  const deriveHalfDates = (half, baseMonth = null) => {
    const base = baseMonth && /^\d{4}-\d{2}$/.test(baseMonth)
      ? new Date(parseInt(baseMonth.slice(0, 4), 10), parseInt(baseMonth.slice(5, 7), 10) - 1, 1)
      : new Date();

    const y = base.getFullYear();
    const m = pad2(base.getMonth() + 1);

    if (half === 'H1') {
      return { start: `${y}-${m}-01`, end: `${y}-${m}-15` };
    }
    return { start: `${y}-${m}-16`, end: endOfMonthYmd(base) };
  };

  // --- Salary/period helpers and validation ---
  const daysInMonthForKey = (monthKey) => {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return 30;
    const y = parseInt(monthKey.slice(0, 4), 10);
    const m = parseInt(monthKey.slice(5, 7), 10) - 1;
    return new Date(y, m + 1, 0).getDate();
  };

  const parseYmd = (s) => {
    if (!s || typeof s !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    return { y, mo, d };
  };

  const compareYmd = (a, b) => {
    // returns -1/0/1
    if (!a || !b) return 0;
    if (a.y !== b.y) return a.y < b.y ? -1 : 1;
    if (a.mo !== b.mo) return a.mo < b.mo ? -1 : 1;
    if (a.d !== b.d) return a.d < b.d ? -1 : 1;
    return 0;
  };

  const inSelectedMonth = (ymdObj, monthKey) => {
    if (!ymdObj || !monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return false;
    const y = parseInt(monthKey.slice(0, 4), 10);
    const m = parseInt(monthKey.slice(5, 7), 10);
    return ymdObj.y === y && ymdObj.mo === m;
  };

  const halfDayRange = (half, monthKey) => {
    const dim = daysInMonthForKey(monthKey);
    if (half === 'H1') return { min: 1, max: 15, denom: 15 };
    return { min: 16, max: dim, denom: Math.max(1, dim - 15) };
  };

  const round2 = (n) => {
    const x = Number(n);
    if (Number.isNaN(x)) return '';
    return (Math.round(x * 100) / 100).toFixed(2);
  };
  // --- Helper: robustly parse number ---
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  // --- Helper: compute net suggested amount (gross - deductions) ---
  const computeNetSuggestedAmount = (emp, startStr, endStr, half, monthKey) => {
    const gross = computeSuggestedAmount(emp, startStr, endStr, half, monthKey);
    const grossNum = toNum(gross);
    const ded = toNum(deductionsByEmployeeId[String(emp?.id)]);
    const net = Math.max(0, grossNum - Math.abs(ded));
    // If gross was '', preserve '' so UI stays consistent
    if (gross === '') return '';
    return round2(net);
  };

  const computeSuggestedAmount = (emp, startStr, endStr, half, monthKey) => {
    const salary = Number(emp?.currentSalary);
    if (!salary || Number.isNaN(salary) || salary <= 0) return '';

    const halfSalary = salary / 2;

    const s = parseYmd(startStr);
    const e = parseYmd(endStr);
    if (!s || !e) return round2(halfSalary);

    const range = halfDayRange(half, monthKey);
    const fullStart = range.min;
    const fullEnd = range.max;

    // If full half selected, always exact 50%
    if (s.d === fullStart && e.d === fullEnd) {
      return round2(halfSalary);
    }

    // Partial within half => prorate within that half
    const workedDays = Math.max(0, (e.d - s.d) + 1);
    const denom = range.denom;
    if (workedDays <= 0 || denom <= 0) return '';

    return round2(halfSalary * (workedDays / denom));
  };

  const periodError = useMemo(() => {
    if (!customDates) return null;
    const s = parseYmd(periodStart);
    const e = parseYmd(periodEnd);
    if (!s || !e) return 'Select valid Start and End dates.';
    if (!inSelectedMonth(s, periodMonth) || !inSelectedMonth(e, periodMonth)) {
      return 'Custom dates must be within the selected month.';
    }
    if (compareYmd(s, e) > 0) {
      return 'Start date must be before (or equal to) End date.';
    }
    const range = halfDayRange(periodHalf, periodMonth);
    if (s.d < range.min || s.d > range.max || e.d < range.min || e.d > range.max) {
      return periodHalf === 'H1'
        ? 'Custom dates must be within 1–15.'
        : 'Custom dates must be within 16–end of month.';
    }
    return null;
  }, [customDates, periodStart, periodEnd, periodHalf, periodMonth]);

  // ------------------------------
  const getMonthKey = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };
  const monthLabel = (key) => {
    const yy = key.slice(0, 4);
    const mm = key.slice(5, 7);
    return `${mm}-${yy}`;
  };
  const monthOptions = (() => {
    const now = new Date();
    const curKey = getMonthKey(now);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = getMonthKey(prev);
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextKey = getMonthKey(next);
    const base = [
      { key: curKey, label: `${monthLabel(curKey)} (current)` },
      { key: prevKey, label: `${monthLabel(prevKey)} (previous)` },
      { key: nextKey, label: `${monthLabel(nextKey)} (next)` },
    ];
    // If periodMonth is something else (edge case), include it so Select can render a value.
    if (periodMonth && !base.find((o) => o.key === periodMonth)) {
      base.push({ key: periodMonth, label: monthLabel(periodMonth) });
    }
    return base;
  })();

  useEffect(() => {
    if (customDates) return;
    const { start, end } = deriveHalfDates(periodHalf, periodMonth);
    setPeriodStart(start);
    setPeriodEnd(end);
  }, [periodHalf, periodMonth, customDates]);

  useEffect(() => {
    // Re-calc auto-filled amounts when the pay period or deductions change
    const ids = Array.from(autoAmountIdsRef.current || []);
    if (!ids.length) return;
    setSelectedAmounts((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        const key = String(id);
        if (!Object.prototype.hasOwnProperty.call(next, key)) return;
        const emp = (employees || []).find((e) => String(e.id) === key);
        if (!emp) return;
        const suggested = computeNetSuggestedAmount(emp, periodStart, periodEnd, periodHalf, periodMonth);
        if (suggested !== '') next[key] = suggested;
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStart, periodEnd, periodHalf, periodMonth, customDates, employees, deductionsByEmployeeId]);

  const loadEmployees = async () => {
    setLoadingEmployees(true);
    setEmployeesError(null);
    try {
      const res = await api.get('/api/employees/options', {
        params: { include: 'bank', status: 'Active' },
      });
      const list = Array.isArray(res.data) ? res.data : (res.data?.rows || []);
      const mapped = list.map((it) => ({
        id: it.value ?? it.id,
        shortName: it.label ?? it.shortName ?? it.name ?? '',
        code: it.code ?? '',
        division: it.division ?? '',
        // Monthly salary used to suggest pay-period amounts
        currentSalary: it.current_salary ?? it.currentSalary ?? it.salary ?? null,
        bankName: it.bankName ?? it.bank?.name ?? '',
        bankAccount: it.bankAccount ?? it.bank?.account ?? '',
        bankHolder: it.name ?? it.bankHolder ?? it.holder ?? it.fullName ?? '',
      }));
      setEmployees(mapped);
    } catch (e) {
      setEmployeesError('Failed to load employees');
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isSelected = (id) => Object.prototype.hasOwnProperty.call(selectedAmounts, String(id)) || Object.prototype.hasOwnProperty.call(selectedAmounts, id);

  // Returns true if any employee is selected
  const hasAnySelections = Object.keys(selectedAmounts || {}).length > 0;

  const handleToggle = (id, checked) => {
    setSelectedAmounts((prev) => {
      const next = { ...prev };
      const key = String(id);
      if (checked) {
        const emp = (employees || []).find((e) => String(e.id) === key);
        const suggested = computeNetSuggestedAmount(emp, periodStart, periodEnd, periodHalf, periodMonth);
        next[key] = suggested !== '' ? suggested : '';
        autoAmountIdsRef.current.add(key);
      } else {
        delete next[key];
        autoAmountIdsRef.current.delete(key);
      }
      // Compute selected divisions from next
      const selectedDivs = new Set(
        Object.keys(next).map((k) => {
          const e = (employees || []).find((x) => String(x.id) === String(k));
          return e?.division || '';
        }).filter(Boolean)
      );
      if (selectedDivs.size === 1) setDivision(Array.from(selectedDivs)[0]);
      else if (selectedDivs.size > 1) setDivision('Mixed');
      else setDivision('Housekeepers');
      return next;
    });
  };

  const handleAmountChange = (id, value) => {
    const key = String(id);
    // User is manually editing => stop auto updates for this employee
    autoAmountIdsRef.current.delete(key);
    setSelectedAmounts((prev) => ({ ...prev, [key]: value }));
  };

  const handleCustomDatesToggle = (checked) => {
    setCustomDates(checked);
    if (!checked) {
      const { start, end } = deriveHalfDates(periodHalf, periodMonth);
      setPeriodStart(start);
      setPeriodEnd(end);
    }
  };

  const validSelectionsCount = Object.values(selectedAmounts || {}).filter(
    (v) => v !== null && v !== undefined && String(v).trim() !== '' && !isNaN(Number(v)) && Number(v) > 0
  ).length;

  // Helper to reset state and close
  const resetState = () => {
    autoAmountIdsRef.current = new Set();
    setEmployees([]);
    setSelectedAmounts({});
    setEmployeesError(null);
    setPeriodHalf('H1');
    setCustomDates(false);
    {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      setPeriodMonth(`${y}-${m}`);
    }
    setPeriodStart('');
    setPeriodEnd('');
    // Reset deductions state
    setDeductionsByEmployeeId({});
    setDeductionsError(null);
    setLoadingDeductions(false);
    setDivision('Housekeepers');
  };
  // --- Async loader for deductions for this period, for a given division ---
  const loadDeductionsForPeriod = async (divisionArg) => {
    if (!divisionArg || !periodStart || !periodEnd) return;
    try {
      const res = await api.get('/api/employee-ledger', {
        params: {
          division: divisionArg,
          type: 'deduction',
          periodStart,
          periodEnd,
        },
      });
      let rows = [];
      if (Array.isArray(res.data)) rows = res.data;
      else if (Array.isArray(res.data?.rows)) rows = res.data.rows;
      else if (Array.isArray(res.data?.data)) rows = res.data.data;
      else if (res.data && typeof res.data === 'object') rows = Object.values(res.data);
      else rows = [];
      // Sum deductions by employee id
      const map = {};
      for (const row of rows) {
        const eid = row?.employee?.id || row?.employeeId || row?.employee_id;
        if (!eid) continue;
        const amt = Number(row.amount);
        if (!Number.isFinite(amt)) continue;
        map[String(eid)] = (map[String(eid)] || 0) + amt;
      }
      return map;
    } catch (e) {
      setDeductionsError('Failed to load deductions');
      return {};
    }
  };

  // --- Loader to fetch deductions for ALL divisions present in employees list, and merge ---
  const loadAllDeductionsForPeriod = async () => {
    if (!periodStart || !periodEnd) return;
    const divs = Array.from(new Set((employees || []).map((e) => e.division).filter(Boolean)));
    if (divs.length === 0) return;
    setLoadingDeductions(true);
    setDeductionsError(null);
    try {
      const maps = await Promise.all(divs.map((d) => loadDeductionsForPeriod(d)));
      const merged = {};
      for (const m of maps) {
        for (const [k, v] of Object.entries(m || {})) {
          merged[k] = (merged[k] || 0) + Number(v || 0);
        }
      }
      setDeductionsByEmployeeId(merged);
    } catch (e) {
      setDeductionsError('Failed to load deductions');
    } finally {
      setLoadingDeductions(false);
    }
  };

  // --- Effect: load deductions when open, employees loaded, or period changes ---
  useEffect(() => {
    if (!open) return;
    if (!employees || employees.length === 0) return;
    if (!periodStart || !periodEnd) return;
    loadAllDeductionsForPeriod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employees, periodStart, periodEnd]);

  const handleClose = () => {
    resetState();
    if (typeof onClose === 'function') onClose();
  };

  // Export is handled internally (backend generates PDF) and downloaded as a blob.
  const handleExport = async () => {
    try {
      const entries = Object.entries(selectedAmounts || {}).filter(
        ([, v]) => v !== null && v !== undefined && String(v).trim() !== '' && !isNaN(Number(v)) && Number(v) > 0
      );
      if (entries.length === 0) {
        alert('Select at least one employee and enter an amount.');
        return;
      }

      const rows = entries.map(([empId, amt]) => {
        const emp = (employees || []).find((e) => String(e.id) === String(empId)) || {};
        return {
          employee_code: emp.code || '',
          bank_holder: emp.bankHolder || emp.name || emp.fullName || '',
          bank_name: emp.bankName || '',
          bank_account: emp.bankAccount || '',
          amount: Number(amt),
        };
      });

      setExporting(true);
      const res = await api.post('/api/reports/hr/payment-request/export.pdf', { division, rows }, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const divSafe = (division || 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      a.href = url;
      // Prefer server-provided filename via Content-Disposition; fallback to Spanish name
      const disposition = (res && res.headers && (res.headers['content-disposition'] || res.headers['Content-Disposition'])) || '';
      let suggestedName = '';
      if (disposition) {
        const m1 = /filename\*=UTF-8''([^;]+)\b/i.exec(disposition);
        const m2 = /filename="?([^";]+)"?/i.exec(disposition);
        if (m1 && m1[1]) suggestedName = decodeURIComponent(m1[1]);
        else if (m2 && m2[1]) suggestedName = m2[1];
      }
      if (!suggestedName) {
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        suggestedName = `SolicitudPagos_${divSafe}_${dd}${mm}${yyyy}.pdf`;
      }
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      handleClose();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.message || 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 480, md: 560 } } }}
    >
      <Box role="presentation" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Payment Request</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={handleClose}>Close</Button>
            <Button
              variant="contained"
              startIcon={<SaveAltIcon />}
              onClick={handleExport}
              disabled={exporting || validSelectionsCount === 0 || !!periodError}
            >
              {exporting ? 'Exporting…' : 'Export PDF'}
            </Button>
          </Stack>
        </Box>
        <Divider />

        {/* Body */}
        <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
          <Stack spacing={2}>


            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Pay period
              </Typography>

              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ flexWrap: 'nowrap', overflowX: 'auto', pb: 0.5 }}
              >
                <FormControl size="small" sx={{ minWidth: 110, maxWidth: 125 }}>
                  <InputLabel id="hr-pay-month-label">Month</InputLabel>
                  <Select
                    labelId="hr-pay-month-label"
                    label="Month"
                    value={periodMonth}
                    renderValue={(val) => (monthLabel(val) || '')}
                    onChange={(e) => {
                      const next = e.target.value;
                      setPeriodMonth(next);
                      // If custom dates are enabled, snap back to defaults for the selected month.
                      if (customDates) {
                        setCustomDates(false);
                        const { start, end } = deriveHalfDates(periodHalf, next);
                        setPeriodStart(start);
                        setPeriodEnd(end);
                      }
                    }}
                  >
                    {monthOptions.map((opt) => (
                      <MenuItem key={opt.key} value={opt.key}>{opt.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <ToggleButtonGroup
                  value={periodHalf}
                  exclusive
                  onChange={(e, v) => {
                    if (v) setPeriodHalf(v);
                  }}
                  size="small"
                >
                  <ToggleButton value="H1">1–15</ToggleButton>
                  <ToggleButton value="H2">16–EOM</ToggleButton>
                </ToggleButtonGroup>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>
                  <Checkbox
                    size="small"
                    checked={customDates}
                    onChange={(e) => handleCustomDatesToggle(e.target.checked)}
                    inputProps={{ 'aria-label': 'custom dates' }}
                  />
                  <Typography variant="body2">Custom dates</Typography>
                </Stack>
              </Stack>

              <Box sx={{ mt: 1 }}>
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{ flexWrap: 'nowrap' }}
                >
                  <FormControl sx={{ minWidth: 140 }} size="small">
                    <InputLabel shrink>Start</InputLabel>
                    <TextField
                      size="small"
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      disabled={!customDates}
                      InputLabelProps={{ shrink: true }}
                    />
                  </FormControl>

                  <FormControl sx={{ minWidth: 140 }} size="small">
                    <InputLabel shrink>End</InputLabel>
                    <TextField
                      size="small"
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      disabled={!customDates}
                      InputLabelProps={{ shrink: true }}
                    />
                  </FormControl>
                </Stack>

                {periodError && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                    {periodError}
                  </Typography>
                )}

                {!periodError && !customDates && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Dates are fixed to the selected half. Enable “Custom dates” to adjust within the same half.
                  </Typography>
                )}
              </Box>
            </Box>

            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              Employees
            </Typography>
            {/* Deductions loader/error UI */}
            {loadingDeductions && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Loading deductions…
              </Typography>
            )}
            {!loadingDeductions && deductionsError && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.5 }}>
                {deductionsError}
              </Typography>
            )}
            <Box>
              {loadingEmployees && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography variant="body2">Loading employees…</Typography>
                </Stack>
              )}
              {!loadingEmployees && employeesError && (
                <Alert severity="error">{employeesError}</Alert>
              )}
              {!loadingEmployees && !employeesError && employees.length > 0 && (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Loaded {employees.length} employee{employees.length === 1 ? '' : 's'}.
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                    Division: {division}
                  </Typography>
                </>
              )}
              {!loadingEmployees && !employeesError && employees.length > 0 && (
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  {employees.map((emp) => {
                    const checked = isSelected(emp.id);
                    const suggestedAmount = computeNetSuggestedAmount(emp, periodStart, periodEnd, periodHalf, periodMonth);
                    const ded = toNum(deductionsByEmployeeId[String(emp.id)]);
                    return (
                      <Box
                        key={emp.id}
                        sx={{
                          border: '1px solid #e0e0e0',
                          borderRadius: 1,
                          p: 1.5,
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <Checkbox
                            checked={checked}
                            onChange={(e) => handleToggle(emp.id, e.target.checked)}
                            inputProps={{ 'aria-label': `select ${emp.shortName}` }}
                          />
                          <Box sx={{ flex: 1 }}>
                            <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
                              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                                {emp.shortName || emp.code || emp.id}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                {emp.division || division}
                              </Typography>
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              {emp.bankHolder || '—'} · {emp.bankName || '—'} · {emp.bankAccount || '—'}
                            </Typography>
                            {ded !== 0 && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                                Deductions this period: {round2(Math.abs(ded))}
                              </Typography>
                            )}
                          </Box>
                          <TextField
                            size="small"
                            type="number"
                            inputProps={{ min: 0, step: '0.01' }}
                            placeholder="Amount"
                            value={checked ? (selectedAmounts[String(emp.id)] ?? '') : (suggestedAmount || '')}
                            onChange={(e) => handleAmountChange(emp.id, e.target.value)}
                            disabled={!checked}
                            sx={{ width: 100 }}
                          />
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Box>
          </Stack>
        </Box>

        {/* Footer (optional additional actions later) */}
        <Box sx={{ p: 2, pt: 0 }}>
        </Box>
      </Box>
    </Drawer>
  );
};

export default HRPaymentDrawer;