// frontend/src/pages/mobilepages/MobileCheckInOutView.jsx
// Mobile Check-Ins/Outs view powered by local fetching.

import * as React from 'react';
import useCurrentUserAccess from '../../hooks/useCurrentUserAccess';
import {
  Box,
  Typography,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  Checkbox,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Chip,
  TextField,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Stack,
} from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { ArrowDownCircleIcon, ArrowUpCircleIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import api from '../../api';
import MobileHKCheckListForm from './mobileForms/MobileHKCheckListForm';


const ymdLocal = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDaysLocal = (baseDate, deltaDays) => {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + deltaDays);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Parse YYYY-MM-DD as local time (not UTC).
const parseYmdLocal = (ymd) => {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
};

const getDaysInRange = (startYmd, endYmd) => {
  if (!startYmd || !endYmd) return [];
  const days = [];
  const s = parseYmdLocal(startYmd);
  const e = parseYmdLocal(endYmd);
  s.setHours(0,0,0,0); e.setHours(0,0,0,0);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate()+1)) {
    days.push(ymdLocal(d));
  }
  return days;
};

const formatYmdEs = (ymd) => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const weekday = dt.toLocaleDateString('es-MX', { weekday: 'long' });
  const cap = weekday ? (weekday.charAt(0).toUpperCase() + weekday.slice(1)) : '';
  const dd = String(d).padStart(2, '0');
  return `${cap}, ${dd}`;
};

const formatYmdEsFull = (ymd) => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const weekday = dt.toLocaleDateString('es-MX', { weekday: 'long' });
  const cap = weekday ? (weekday.charAt(0).toUpperCase() + weekday.slice(1)) : '';
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const yyyy = String(y);
  return `${cap}, ${dd}/${mm}/${yyyy}`;
};

export default function MobileCheckInOutView() {
  const { isLoading, isAdmin, isManager, isSupervisor, employee, normArea } = useCurrentUserAccess();

  const [start, setStart] = React.useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    // Default: today
    return ymdLocal(now);
  });
  const [end, setEnd] = React.useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    // Default: today + 6
    const d = addDaysLocal(now, 6);
    return ymdLocal(d);
  });
  const [city, setCity] = React.useState('All');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [grouped, setGrouped] = React.useState([]);
  const [cityOptions, setCityOptions] = React.useState(['All']);
  const [checklistCleaning, setChecklistCleaning] = React.useState(null);
  const [checklistUnit, setChecklistUnit] = React.useState(null);
  const [checklistInitialData, setChecklistInitialData] = React.useState(null);
  const [checklistReadOnly, setChecklistReadOnly] = React.useState(false);

  // Derive employee city and flags for city locking
  const employeeCity = employee?.city || null;
  const isCleaner = normArea === 'cleaner';
  const lockCityToEmployee = !!employeeCity && !isAdmin && !isManager && !isSupervisor;

  // Cleaners: lock date range (today - 2) to (today + 6) and hide date selectors.
  React.useEffect(() => {
    if (!isCleaner) return;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const s = addDaysLocal(now, -2);
    const e = addDaysLocal(now, 6);
    const sYmd = ymdLocal(s);
    const eYmd = ymdLocal(e);

    // Only set if changed to avoid extra renders
    setStart((prev) => (prev === sYmd ? prev : sYmd));
    setEnd((prev) => (prev === eYmd ? prev : eYmd));
  }, [isCleaner]);

  const inputHeight = 44; // consistent control height for header filters

  React.useEffect(() => {
    if (lockCityToEmployee) {
      setCity(employeeCity);
      setCityOptions([employeeCity]);
    }
  }, [lockCityToEmployee, employeeCity]);

  const citiesToRender = React.useMemo(() => {
    if (lockCityToEmployee && employeeCity) return [employeeCity];
    const all = ['Playa del Carmen', 'Tulum'];
    return city && city !== 'All' ? [city] : all;
  }, [city, lockCityToEmployee, employeeCity]);

  const days = React.useMemo(
    () => getDaysInRange(start, end),
    [start, end]
  );

  const findByDate = React.useCallback(
    (date) => grouped.find((g) => g.date === date) || { date, ins: [], outs: [] },
    [grouped]
  );

  const groupRows = React.useCallback((rows) => {
    const byDate = new Map();
    const add = (date, type, row) => {
      if (!date) return;
      const key = String(date).slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, { date: key, ins: [], outs: [] });
      const hkCleaningId =
        row.hk_cleaning_id ??
        row.hkCleaningId ??
        (row.hk_cleaning && row.hk_cleaning.id) ??
        (row.hkCleaning && row.hkCleaning.id) ??
        (row.hk && row.hk.id) ??
        null;
      const hkDone =
        (row.hk && row.hk.done !== undefined ? row.hk.done : undefined) ??
        (row.hk_cleaning && row.hk_cleaning.done !== undefined ? row.hk_cleaning.done : undefined) ??
        row.hk_done ??
        false;
      const item = {
        bookingId: row.id,
        unitId: row.unit_id,
        unitName: row.unit_name,
        guestName: row.guest,
        code: row.reservation_code,
        city: row.city,
        date: key,
        hkCleaningId,
        done: Boolean(hkDone),
        check_out_notes: row.check_out_notes,
        check_in_notes: row.check_in_notes,
        days_since_last_checkout: row.days_since_last_checkout,
        checklistHasDraft: row.checklist_has_draft ?? row.checklistHasDraft ?? false,
        checklistSubmittedAt: row.checklist_submitted_at ?? row.checklistSubmittedAt ?? row.checklist_submittedAt ?? null,
        checklistCleanerId: row.checklist_cleaner_id ?? row.checklistCleanerId ?? null,
        checklistCleanerShortName: row.checklist_cleaner_short_name ?? row.checklistCleanerShortName ?? null,
        assignedToId: row.hk_assigned_to_id ?? row.hkAssignedToId ?? (row.hk && row.hk.assignedToId) ?? null,
        assignedToShortName: row.hk_assigned_to_short_name ?? row.hkAssignedToShortName ?? (row.hk && row.hk.assignedToShortName) ?? null,
      };
      if (type === 'OUT') byDate.get(key).outs.push(item);
      else byDate.get(key).ins.push(item);
    };
    for (const r of rows || []) {
      if (r.event_check_out) add(r.check_out, 'OUT', r);
      if (r.event_check_in) add(r.check_in, 'IN', r);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, []);
  const canAssign = !!(isAdmin || isManager || isSupervisor);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [assignRow, setAssignRow] = React.useState(null);
  const [assignCleaners, setAssignCleaners] = React.useState([]);
  const [assignLoading, setAssignLoading] = React.useState(false);
  const [assignSaving, setAssignSaving] = React.useState(false);
  const [assignError, setAssignError] = React.useState(null);
  const [assignSelectedId, setAssignSelectedId] = React.useState('');
  const handleView = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/bookings/check-activity', {
        params: {
          start,
          end,
          city: lockCityToEmployee ? employeeCity : (city !== 'All' ? city : undefined),
        },
        withCredentials: true,
      });
      const rows = Array.isArray(data) ? data : (data?.data || []);
      setGrouped(groupRows(rows));
      if (lockCityToEmployee && employeeCity) {
        setCityOptions([employeeCity]);
      } else {
        const cities = new Set(['All']);
        rows.forEach((r) => r.city && cities.add(r.city));
        setCityOptions(Array.from(cities));
      }
    } catch (e) {
      setError(e);
      setGrouped([]);
    } finally {
      setLoading(false);
    }
  }, [start, end, city, groupRows, lockCityToEmployee, employeeCity]);
  const openAssignModal = React.useCallback(async (row) => {
    if (!canAssign) return;
    if (!row?.hkCleaningId) return;

    setAssignError(null);
    setAssignRow(row);
    setAssignSelectedId(row.assignedToId ? String(row.assignedToId) : '');
    setAssignOpen(true);
    setAssignLoading(true);

    try {
      const resp = await api.get('/api/hk-cleanings/assignable-cleaners', {
        params: { city: row.city || undefined },
        withCredentials: true,
      });
      const list = resp?.data?.data ?? resp?.data ?? [];
      setAssignCleaners(Array.isArray(list) ? list : []);
    } catch (e) {
      setAssignCleaners([]);
      setAssignError(e);
    } finally {
      setAssignLoading(false);
    }
  }, [canAssign]);

  const closeAssignModal = React.useCallback(() => {
    setAssignOpen(false);
    setAssignRow(null);
    setAssignCleaners([]);
    setAssignLoading(false);
    setAssignSaving(false);
    setAssignError(null);
    setAssignSelectedId('');
  }, []);

  const saveAssignment = React.useCallback(async () => {
    if (!canAssign) return;
    if (!assignRow?.hkCleaningId) return;

    setAssignSaving(true);
    setAssignError(null);
    try {
      const assignedToId = assignSelectedId ? Number(assignSelectedId) : null;
      await api.post(`/api/hk-cleanings/${assignRow.hkCleaningId}/assign`, {
        assignedToId,
        city: assignRow.city || undefined,
      }, { withCredentials: true });

      closeAssignModal();
      // Refresh list so the assigned name shows immediately
      handleView();
    } catch (e) {
      setAssignError(e);
    } finally {
      setAssignSaving(false);
    }
  }, [canAssign, assignRow, assignSelectedId, closeAssignModal, handleView]);

  const handleOpenChecklist = React.useCallback(async (row, opts = {}) => {
    if (!row.hkCleaningId) {
      console.warn('No HK cleaning id for this row; cannot open checklist.', row);
      return;
    }

    const myEmployeeId = employee?.id ?? null;
    const hasDraft = !!row.checklistHasDraft && !row.checklistSubmittedAt;
    const hasAssignedDraftCleaner = !!row.checklistCleanerId;
    const cleanerMismatch = hasAssignedDraftCleaner && myEmployeeId && Number(myEmployeeId) !== Number(row.checklistCleanerId);

    // Rule (3): if Cleaner and different id => no action
    if (isCleaner && hasDraft && cleanerMismatch) {
      return;
    }

    // Default readOnly rule:
    // - if it's a draft owned by someone else => readOnly
    // - if it's submitted => readOnly for cleaners (historical), editable for admin/manager if needed later
    // For now: only allow edits when (draft + same cleaner) OR (no draft/submitted yet).
    let readOnly = false;
    if (hasDraft && cleanerMismatch) readOnly = true;

    // Fetch existing checklist state (draft/submitted) so the form can hydrate.
    let initialData = null;
    try {
      const resp = await api.get(`/api/hk-cleanings/${row.hkCleaningId}/checklist-state`, { withCredentials: true });
      const payload = resp?.data?.data ?? resp?.data ?? null;
      if (payload && (payload.checklistData || payload.notes)) {
        initialData = {
          checklistData: Array.isArray(payload.checklistData) ? payload.checklistData : (Array.isArray(payload.checklist_data) ? payload.checklist_data : null),
          notes: typeof payload.notes === 'string' ? payload.notes : (typeof payload.cleaning_notes === 'string' ? payload.cleaning_notes : ''),
          submittedAt: payload.submittedAt ?? payload.submitted_at ?? null,
          cleanerId: payload.cleanerId ?? payload.cleaner_id ?? payload.checklist_cleaner_id ?? null,
          hasDraft: payload.hasDraft ?? payload.checklist_has_draft ?? null,
        };
        // If backend tells us it's submitted, enforce readOnly for cleaners.
        const submitted = !!(initialData.submittedAt);
        if (submitted && isCleaner) {
          readOnly = true;
        }
        // If backend returns a cleanerId and it mismatches, enforce readOnly for non-cleaners.
        if (initialData.cleanerId && myEmployeeId && Number(myEmployeeId) !== Number(initialData.cleanerId) && hasDraft) {
          readOnly = true;
        }
      }
    } catch (e) {
      // If state cannot be loaded, fall back to blank form (existing behavior)
      console.warn('Could not load checklist state; opening blank form.', e);
    }

    // Minimal cleaning + unit objects for the form
    setChecklistCleaning({
      id: row.hkCleaningId,
      unitName: row.unitName,
      unit_name: row.unitName,
    });
    setChecklistUnit({
      id: row.unitId,
      unitName: row.unitName,
      unit_name: row.unitName,
      city: row.city,
    });
    setChecklistInitialData(initialData);
    // Allow caller to force readOnly (e.g., submitted rows opened as view-only)
    const forcedReadOnly = typeof opts?.readOnly === 'boolean' ? opts.readOnly : null;
    setChecklistReadOnly(forcedReadOnly === null ? !!readOnly : !!forcedReadOnly);
  }, [employee?.id, isCleaner, isAdmin, isManager, isSupervisor]);

  const handleChecklistClose = React.useCallback(() => {
    setChecklistCleaning(null);
    setChecklistUnit(null);
    setChecklistInitialData(null);
    setChecklistReadOnly(false);
  }, []);

  const handleChecklistSuccess = React.useCallback(
    (payload) => {
      // Close the form and refresh the list so the "done" status updates.
      handleChecklistClose();
      handleView();
    },
    [handleChecklistClose, handleView]
  );

  React.useEffect(() => {
    handleView();
  }, [handleView]);

  // Access control: Admin/Manager/Supervisor + Cleaner (mobile-only workflow)
  if (isLoading) return null;
  if (!isAdmin && !isManager && !isSupervisor && !isCleaner) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          No access to this page.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {/* Sticky header with Start/End/City selectors and View button */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 5, bgcolor: '#1E6F68', color: 'white', px: 2, pt: 1.5, pb: 1, borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
        {/* Removed the title line as per instructions */}

        {/* Row 1: Start + End (locked for Cleaners) */}
        {isCleaner ? (
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {formatYmdEsFull(start)} a {formatYmdEsFull(end)}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <TextField
              label="Start"
              type="date"
              size="small"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{
                '& .MuiInputBase-input': { color: 'white' },
                '& .MuiInputLabel-root': { color: 'white' },
                '& .MuiSvgIcon-root': { color: 'white' },
                '& input[type="date"]::-webkit-calendar-picker-indicator': {
                  filter: 'invert(1) brightness(1.2)',
                },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' },
                '& .MuiOutlinedInput-root': { height: `${inputHeight}px`, alignItems: 'center' },
              }}
            />
            <TextField
              label="End"
              type="date"
              size="small"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{
                '& .MuiInputBase-input': { color: 'white' },
                '& .MuiInputLabel-root': { color: 'white' },
                '& .MuiSvgIcon-root': { color: 'white' },
                '& input[type="date"]::-webkit-calendar-picker-indicator': {
                  filter: 'invert(1) brightness(1.2)',
                },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' },
                '& .MuiOutlinedInput-root': { height: `${inputHeight}px`, alignItems: 'center' },
              }}
            />
          </Box>
        )}
        {/* Selected city label (kept in the sticky header so it never hides under the green area) */}
        {city && city !== 'All' ? (
          <Box sx={{ mt: 1, pb: 0.25 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
              {city}
            </Typography>
          </Box>
        ) : null}

        {/* Row 2: City + View (hidden for Cleaners) */}
        {!isCleaner ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: lockCityToEmployee ? '1fr' : '1fr 1fr',
              gap: 1,
              mt: 1,
            }}
          >
            {!lockCityToEmployee ? (
              <TextField
                select
                label="City"
                size="small"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                sx={{
                  width: '100%',
                  '& .MuiInputBase-input': { color: 'white' },
                  '& .MuiInputLabel-root': { color: 'white' },
                  '& .MuiSvgIcon-root': { color: 'white' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' },
                  '& .MuiOutlinedInput-root': { height: `${inputHeight}px`, alignItems: 'center' },
                }}
              >
                {cityOptions.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}

            <Button
              variant="contained"
              size="small"
              onClick={handleView}
              sx={{ justifySelf: 'end', alignSelf: 'center', px: 2 }}
            >
              View
            </Button>
          </Box>
        ) : null}
      </Box>

      {/* Content */}
      <Box>
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={22} />
            <Typography variant="body2" sx={{ ml: 1 }}>Loading…</Typography>
          </Box>
        )}

        {!loading && grouped.length === 0 && (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">No activity for this period.</Typography>
          </Box>
        )}

        {citiesToRender.map((cityName) => (
          <Box key={`city-${cityName}`} sx={{ px: 1.5, pt: 1.5, pb: 0 }}>
            {city === 'All' ? (
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>{cityName}</Typography>
            ) : null}
            {days.map((d) => {
              const g = findByDate(d);
              const outs = (g.outs || []).filter(r => r.city === cityName);
              const ins  = (g.ins  || []).filter(r => r.city === cityName);
              const outUnits = new Set(outs.map(r => r.unitName).filter(Boolean));
              const inUnits  = new Set(ins.map(r => r.unitName).filter(Boolean));
              return (
                <Box key={`${cityName}-${d}`} sx={{ py: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatYmdEs(d)}</Typography>
                    {(() => {
                      const parts = [
                        `${outs.length} Out`,
                        `${ins.length} In`,
                      ];
                      // Detect units that have both an OUT and an IN on the same day
                      const outUnitsInner = new Set(outs.map(r => r.unitName).filter(Boolean));
                      const inUnitsInner  = new Set(ins.map(r => r.unitName).filter(Boolean));
                      const both = Array.from(outUnitsInner).filter(u => inUnitsInner.has(u));
                      if (both.length > 0) {
                        parts.push(`${both.length} Out/In`);
                      }
                      return (
                        <Typography variant="caption" color="text.secondary">{parts.join(' · ')}</Typography>
                      );
                    })()}
                  </Box>
                  <List dense disablePadding>
                    {outs.map((r) => (
                      <ListItem
                        key={`out-${r.bookingId}-${r.date}`}
                        divider
                        secondaryAction={
                          (() => {
                            const hasDraft = !!r.checklistHasDraft && !r.checklistSubmittedAt;
                            const isSubmitted = !!r.checklistSubmittedAt;
                            const myEmployeeId = employee?.id ?? null;
                            const cleanerId = r.checklistCleanerId ?? null;
                            const cleanerShortName = r.checklistCleanerShortName ?? null;
                            const assignedShortName = r.assignedToShortName ?? null;
                            const nameToRender = cleanerShortName || assignedShortName;
                            const nameIsAssignedOnly = !!(assignedShortName && !cleanerShortName);
                            const cleanerMismatch = !!(isCleaner && cleanerId && myEmployeeId && Number(myEmployeeId) !== Number(cleanerId));

                            // Behavior rules:
                            // - Submitted:
                            //   * Cleaner and NOT creator => render like draft saved (amber) and NO ACTION
                            //   * Creator OR admin/manager/supervisor => open form read-only
                            // - Draft (not submitted):
                            //   * Cleaner and NOT creator => grey and NO ACTION
                            //   * Otherwise => amber and open (editable)
                            // - Done icon should also be tappable for allowed users (view-only when submitted)

                            let statusColor = '#6b7280';
                            let checked = false;
                            let action = () => handleOpenChecklist(r);
                            let forceReadOnly = false;

                            if (isSubmitted) {
                              checked = true;
                              statusColor = cleanerMismatch ? '#f59e0b' : '#1E6F68';
                              action = cleanerMismatch ? null : () => handleOpenChecklist(r, { readOnly: true });
                              forceReadOnly = true;
                            } else if (hasDraft) {
                              checked = true;
                              statusColor = cleanerMismatch ? '#9ca3af' : '#f59e0b';
                              action = cleanerMismatch ? null : () => handleOpenChecklist(r);
                            } else {
                              checked = false;
                              statusColor = '#6b7280';
                              action = () => handleOpenChecklist(r);
                            }

                            // Name component for cleaner short name or assigned
                            const Name = ({ text, assignedOnly }) => {
                              if (!text) return null;
                              return (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    mr: 0.75,
                                    whiteSpace: 'nowrap',
                                    opacity: assignedOnly ? 0.6 : 0.75,
                                    color: assignedOnly ? '#6b7280' : 'inherit',
                                  }}
                                >
                                  {text}
                                </Typography>
                              );
                            };

                            // If row is marked done, show a check icon.
                            // BUT: if there is a submitted checklist and the user is allowed, make it tappable to open read-only.
                            if (r.done) {
                              const canOpenDone = !!action && (isSubmitted || hasDraft);
                              if (!canOpenDone) {
                                return (
                                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Name text={nameToRender} assignedOnly={nameIsAssignedOnly} />
                                    <CheckCircleIcon sx={{ color: '#16a34a' }} />
                                  </Box>
                                );
                              }
                              return (
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <Name text={nameToRender} assignedOnly={nameIsAssignedOnly} />
                                  <IconButton
                                    edge="end"
                                    size="small"
                                    aria-label="Ver checklist"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!action) return;
                                      action();
                                    }}
                                  >
                                    <CheckCircleIcon sx={{ color: '#16a34a' }} />
                                  </IconButton>
                                </Box>
                              );
                            }

                            // Main row: show name, assign button (if admin/manager/supervisor), then checkbox
                            // Refactored assign icon position logic for OUT row:
                            return (
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                {/* If assigned but no draft nor submitted, show assign icon BEFORE name */}
                                {canAssign && r.hkCleaningId && assignedShortName && !hasDraft && !isSubmitted ? (
                                  <IconButton
                                    size="small"
                                    aria-label="Reasignar limpieza"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openAssignModal(r);
                                    }}
                                    sx={{ mr: 0.25 }}
                                  >
                                    <PersonOutlineIcon sx={{ fontSize: 18, color: '#9ca3af' }} />
                                  </IconButton>
                                ) : null}

                                <Name text={nameToRender} assignedOnly={nameIsAssignedOnly} />

                                {/* Default assign icon position (after name) */}
                                {canAssign && r.hkCleaningId && !(assignedShortName && !hasDraft && !isSubmitted) ? (
                                  <IconButton
                                    size="small"
                                    aria-label="Asignar limpieza"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openAssignModal(r);
                                    }}
                                    sx={{ mr: 0.25 }}
                                  >
                                    <PersonOutlineIcon sx={{ fontSize: 18, color: '#e5e7eb' }} />
                                  </IconButton>
                                ) : null}

                                <Checkbox
                                  edge="end"
                                  icon={<RadioButtonUncheckedIcon sx={{ color: statusColor }} />}
                                  checkedIcon={<RadioButtonCheckedIcon sx={{ color: statusColor }} />}
                                  checked={checked}
                                  disabled={!action}
                                  onClick={(e) => {
                                    // iOS/MUI: when `checked` is controlled, `onChange` may not fire reliably.
                                    // Use click/tap as the action trigger instead.
                                    if (!action) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    action();
                                  }}
                                  onChange={() => { /* controlled visual only */ }}
                                  inputProps={{ 'aria-label': 'Completar checklist de limpieza' }}
                                />
                              </Box>
                            );
                          })()
                        }
                      >
                        {inUnits.has(r.unitName)
                          ? <ArrowPathIcon style={{ display: 'block', width: 16, height: 16, color: '#e53935', marginRight: 8 }} />
                          : <ArrowUpCircleIcon style={{ display: 'block', width: 16, height: 16, color: '#e53935', marginRight: 8 }} />}
                        <ListItemText
                          primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>{r.unitName}</Typography>}
                          secondary={r.check_out_notes ? (
                            <Typography variant="caption" color="text.secondary">{r.check_out_notes}</Typography>
                          ) : null}
                        />
                      </ListItem>
                    ))}
                    {ins.map((r) => (
                      <ListItem key={`in-${r.bookingId}-${r.date}`} divider>
                        {outUnits.has(r.unitName)
                          ? <ArrowPathIcon style={{ display: 'block', width: 16, height: 16, color: '#43a047', marginRight: 8 }} />
                          : <ArrowDownCircleIcon style={{ display: 'block', width: 16, height: 16, color: (Number(r.days_since_last_checkout) > 5 ? '#FFB300' : '#43a047'), marginRight: 8 }} />}
                        <ListItemText
                          primary={
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {r.unitName}
                              {(Number(r.days_since_last_checkout) > 5 && !outUnits.has(r.unitName)) ? (
                                <Typography component="span" variant="caption" sx={{ ml: 1, opacity: 0.6 }}>
                                  ({Number(r.days_since_last_checkout)}d)
                                </Typography>
                              ) : null}
                            </Typography>
                          }
                          secondary={r.check_in_notes ? (
                            <Typography variant="caption" color="text.secondary">{r.check_in_notes}</Typography>
                          ) : null}
                        />
                      </ListItem>
                    ))}
                    {(outs.length === 0 && ins.length === 0) && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>—</Typography>
                    )}
                  </List>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>

      <Dialog open={assignOpen} onClose={closeAssignModal} fullWidth maxWidth="xs">
        <DialogTitle>Asignar limpieza</DialogTitle>
        <DialogContent dividers>
          {assignRow ? (
            <Stack spacing={1.25} sx={{ mt: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {assignRow.unitName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatYmdEsFull(assignRow.date)} · {assignRow.city}
              </Typography>

              <FormControl fullWidth size="small" disabled={assignLoading || assignSaving}>
                <InputLabel id="assign-cleaner-label">Cleaner</InputLabel>
                <Select
                  labelId="assign-cleaner-label"
                  label="Cleaner"
                  value={assignSelectedId}
                  onChange={(e) => setAssignSelectedId(e.target.value)}
                >
                  <MenuItem value="">
                    <em>Sin asignar</em>
                  </MenuItem>
                  {assignCleaners.map((c) => (
                    <MenuItem key={c.id} value={String(c.id)}>
                      {c.short_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {assignError ? (
                <Typography variant="caption" sx={{ color: '#b91c1c' }}>
                  No se pudo cargar/guardar. Intenta de nuevo.
                </Typography>
              ) : null}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={closeAssignModal}
            disabled={assignSaving}
            sx={{
              color: '#d97706', // amber-600
              fontWeight: 600,
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={saveAssignment}
            disabled={assignLoading || assignSaving}
            sx={{
              bgcolor: '#1E6F68', // Owners2 teal
              '&:hover': { bgcolor: '#175b55' },
              fontWeight: 600,
            }}
          >
            {assignSaving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {checklistCleaning && (
        <MobileHKCheckListForm
          cleaning={checklistCleaning}
          unit={checklistUnit}
          initialData={checklistInitialData}
          readOnly={checklistReadOnly}
          onClose={handleChecklistClose}
          onSuccess={handleChecklistSuccess}
        />
      )}

    </Box>
  );
}