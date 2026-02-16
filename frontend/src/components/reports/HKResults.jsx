import React, { useMemo, useState } from 'react';
import { Box, Typography, Paper, Grid, Menu, MenuItem } from '@mui/material';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Divider } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

function fmtInt(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);
}

export default function HKResults({
  yearMonth,
  report = null,
  rows = [],
  loading = false,
  error = null,
}) {
  const [expanded, setExpanded] = useState({}); // { [key: string]: boolean } (e.g. "City::Category")
  const toggleExpanded = (cat) => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));

  const [monthResultCity, setMonthResultCity] = useState('All');
  const [monthResultAnchorEl, setMonthResultAnchorEl] = useState(null);
  const monthResultMenuOpen = Boolean(monthResultAnchorEl);
  const openMonthResultMenu = (e) => setMonthResultAnchorEl(e.currentTarget);
  const closeMonthResultMenu = () => setMonthResultAnchorEl(null);

  // Display city helper
  const displayCity = (c) => (c === 'General' ? 'Admin' : c === 'Playa' ? 'Playa del Carmen' : c);

  const displayUnit = (r) => {
    const name = r?.unit_name != null ? String(r.unit_name).trim() : '';
    if (name) return name;
    const id = r?.unit_id != null ? String(r.unit_id).trim() : '';
    return id ? `#${id}` : '—';
  };

  // ===== City normalization (used by multiple aggregations) =====
  const normalizeCity = (r) => {
    // Business rules provided:
    // - cost_centre Housekeepers_General → bucket "General"
    // - Otherwise use city (Playa del Carmen → "Playa", Tulum → "Tulum")
    // - Fallback "Unknown"
    if (r?._kind === 'hr' && r?.city) return r.city;
    const cc = (r.cost_centre || '').toLowerCase();
    if (cc === 'housekeepers_general' || cc === 'housekeepers general') return 'General';
    const c = (r.city || '').toLowerCase();
    if (c.includes('tulum')) return 'Tulum';
    if (c.includes('playa')) return 'Playa';
    return 'Unknown';
  };

  const safeRows = Array.isArray(rows) ? rows : [];

  const filteredRows = useMemo(() => {
    return safeRows.filter(r => (r.unit_status || '').toLowerCase() !== 'alor');
  }, [safeRows]);

  // Normalize HR ledger rows into the same shape used by the By Type / Category table.
  // We treat HR as an Owners2 expense: paid = amount, charged = 0, so balance becomes negative.
  const hrRowsNormalized = useMemo(() => {
    const hr = report?.hr?.rows;
    if (!Array.isArray(hr) || hr.length === 0) return [];

    return hr.map((r) => {
      const cc = String(r?.cost_centre || 'HK_General');
      let city = 'General';
      if (cc === 'HK_Tulum') city = 'Tulum';
      else if (cc === 'HK_Playa') city = 'Playa';

      const t = String(r?.type || '').toLowerCase();
      const typeLabel = t === 'advance' ? 'Advance' : 'Salary';

      return {
        _kind: 'hr',
        id: r?.id,
        employee_id: r?.employee_id ?? null,
        employee_shortname: r?.employee_shortname || null,
        type: t,
        unit_id: null,
        unit_name: null,
        city,
        category_id: null,
        category_name: null,
        // stable key for HR categories in the category table
        _categoryKey: `hr:${t || 'salary'}`,
        _categoryLabel: `HR – ${typeLabel}s`,
        cost_centre: cc,
        allocation_target: 'Owners2',
        description: `${r?.employee_shortname || '—'}${r?.area ? ` • ${r.area}` : ''} • ${typeLabel}`,
        paid: Number(r?.amount || 0) || 0,
        charged: 0,
        period_start: r?.period_start,
        period_end: r?.period_end,
      };
    });
  }, [report]);

  // Source rows for the By Type / Category table: HK transactions + HR rows.
  const typeCategorySourceRows = useMemo(() => {
    return [...filteredRows, ...hrRowsNormalized];
  }, [filteredRows, hrRowsNormalized]);

  // ===== HR aggregation for the By Type / Category card (special nested rendering) =====
  const hrAgg = useMemo(() => {
    const out = {
      totalPaid: 0,
      totalCharged: 0,
      totalRows: 0,
      byType: {
        salary: { paid: 0, charged: 0, rows: 0 },
        advance: { paid: 0, charged: 0, rows: 0 },
      },
      // detailsByType[type] = [{ employee_id, employee_shortname, amount }]
      detailsByType: {
        salary: [],
        advance: [],
      },
    };

    if (!Array.isArray(hrRowsNormalized) || hrRowsNormalized.length === 0) return out;

    const group = { salary: {}, advance: {} };

    for (const r of hrRowsNormalized) {
      const t = String(r?.type || '').toLowerCase();
      const typeKey = t === 'advance' ? 'advance' : 'salary';
      const amt = Number(r?.paid || 0) || 0;

      out.totalPaid += amt;
      out.totalRows += 1;

      out.byType[typeKey].paid += amt;
      out.byType[typeKey].rows += 1;

      const empId = r?.employee_id != null ? String(r.employee_id) : 'unknown';
      if (!group[typeKey][empId]) {
        group[typeKey][empId] = {
          employee_id: r?.employee_id ?? null,
          employee_shortname: r?.employee_shortname || '—',
          amount: 0,
        };
      }
      group[typeKey][empId].amount += amt;
    }

    out.detailsByType.salary = Object.values(group.salary).sort((a, b) => String(a.employee_shortname).localeCompare(String(b.employee_shortname)));
    out.detailsByType.advance = Object.values(group.advance).sort((a, b) => String(a.employee_shortname).localeCompare(String(b.employee_shortname)));

    // rounding for stable UI
    out.totalPaid = Number(out.totalPaid.toFixed(2));
    out.byType.salary.paid = Number(out.byType.salary.paid.toFixed(2));
    out.byType.advance.paid = Number(out.byType.advance.paid.toFixed(2));

    return out;
  }, [hrRowsNormalized]);

  // ===== HR Paid by city (for balance adjustments) =====
  const hrPaidByCity = useMemo(() => {
    const map = { All: 0 };
    if (!Array.isArray(hrRowsNormalized) || hrRowsNormalized.length === 0) return map;

    for (const r of hrRowsNormalized) {
      const city = String(r?.city || 'General');
      const amt = Number(r?.paid || 0) || 0;
      map.All += amt;
      map[city] = (map[city] || 0) + amt;
    }

    // round for stable UI
    Object.keys(map).forEach((k) => {
      map[k] = Number((Number(map[k]) || 0).toFixed(2));
    });

    return map;
  }, [hrRowsNormalized]);

  // Map from category_id to category_name for stable display (for "By Type / Category")
  const categoryIdToName = useMemo(() => {
    const m = {};
    for (const r of filteredRows) {
      const id = r?.category_id;
      const name = r?.category_name;
      if (id == null) continue;
      const key = String(id);
      if (name != null && String(name).trim() !== '') {
        m[key] = String(name);
      }
    }
    return m;
  }, [filteredRows]);

  // ===== Net result per unit (single source of truth for HK results) =====
  const perUnitNet = useMemo(() => {
    const map = {};

    for (const r of filteredRows) {
      if (!r.unit_id) continue;

      if (!map[r.unit_id]) {
        map[r.unit_id] = {
          unit_id: r.unit_id,
          unit_name: r.unit_name,
          city: normalizeCity(r),
          charged: 0,
          paid: 0,
          net: 0,
          rows: [],
        };
      }

      const paid = Number(r.paid || 0) || 0;
      const charged = Number(r.charged || 0) || 0;

      map[r.unit_id].paid += paid;
      map[r.unit_id].charged += charged;
      map[r.unit_id].net += (charged - paid);
      map[r.unit_id].rows.push(r);
    }

    return Object.values(map).sort((a, b) => a.net - b.net);
  }, [filteredRows]);

  // ===== Helper constants and functions for per-unit filtering =====
  const HOUSEKEEPERS_UNIT_ID = 29;
  const isHousekeepersUnit = (u) =>
    Number(u?.unit_id) === HOUSEKEEPERS_UNIT_ID ||
    String(u?.unit_name || '').toLowerCase().includes('housekeepers');
  const EPS = 0.0001;

  // Per-unit expand/collapse
  const [unitOpen, setUnitOpen] = useState({});
  const toggleUnitOpen = (unitId) => setUnitOpen(prev => ({ ...prev, [unitId]: !prev[unitId] }));

  // Group perUnitNet by city and compute totals, with special handling for Housekeepers unit and net~0 filtering
  const perUnitByCity = useMemo(() => {
    // Build buckets by city, separating housekeepers unit and real units
    const cityBuckets = {};
    let totalNet = 0;
    for (const u of perUnitNet) {
      const city = u.city || 'Unknown';
      if (!cityBuckets[city]) {
        cityBuckets[city] = {
          city,
          netTotal: 0,
          hkUnit: null,
          units: [],
        };
      }
      cityBuckets[city].netTotal += Number(u.net || 0) || 0;
      totalNet += Number(u.net || 0) || 0;
      if (isHousekeepersUnit(u)) {
        cityBuckets[city].hkUnit = u;
      } else {
        // Only include real units with abs(net) > EPS
        if (Math.abs(Number(u.net) || 0) > EPS) {
          cityBuckets[city].units.push(u);
        }
      }
    }
    // Only keep cities with at least one hkUnit (with abs(net)>EPS) or at least one real unit
    const displayCities = Object.values(cityBuckets).filter(c => {
      const hkOk = c.hkUnit && Math.abs(Number(c.hkUnit.net) || 0) > EPS;
      return hkOk || c.units.length > 0;
    });
    // stable ordering: General, Playa, Tulum, Unknown, then alpha
    const order = ['General', 'Playa', 'Tulum', 'Unknown'];
    displayCities.sort((a, b) => {
      const ai = order.indexOf(a.city);
      const bi = order.indexOf(b.city);
      if (ai !== -1 || bi !== -1) {
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      }
      return String(a.city).localeCompare(String(b.city));
    });
    // sort units inside city by net asc (worst first)
    for (const c of displayCities) {
      c.units.sort((a, b) => (Number(a.net || 0) || 0) - (Number(b.net || 0) || 0));
    }
    return { totalNet, cities: displayCities };
  }, [perUnitNet, isHousekeepersUnit, EPS]);


  const categoryAgg = useMemo(() => {
    // Structure: { categories: { [key]: {label, paid, charged, rows, ...} }, totals: {...} }
    const out = { categories: {}, totals: { paid: 0, charged: 0, rows: 0 } };

    for (const r of typeCategorySourceRows) {
      // Build stable category key and label
      const isHr = r?._kind === 'hr';
      if (isHr) {
        const paid = Number(r.paid || 0) || 0;
        const charged = Number(r.charged || 0) || 0;
        out.totals.paid += paid;
        out.totals.charged += charged;
        out.totals.rows += 1;
        continue;
      }
      const catId = r.category_id != null && r.category_id !== '' ? String(r.category_id) : null;
      const catName = (r.category_name != null && String(r.category_name).trim() !== '')
        ? String(r.category_name)
        : (catId && categoryIdToName[catId] ? categoryIdToName[catId] : null);

      const cat = catId ? `id:${catId}` : 'uncategorized';

      const catMap = out.categories;
      if (!catMap[cat]) {
        catMap[cat] = {
          label: catName || (catId ? `#${catId}` : 'Uncategorized'),
          paid: 0,
          charged: 0,
          rows: 0,
          clientPaid: 0,
          clientCharged: 0,
          clientRows: 0,
        };
      }

      const paid = Number(r.paid || 0) || 0;
      const charged = Number(r.charged || 0) || 0;
      const isClient = (r.allocation_target || '').toLowerCase() === 'client';

      catMap[cat].paid += paid;
      catMap[cat].charged += charged;
      catMap[cat].rows += 1;
      if (isClient) {
        catMap[cat].clientPaid += paid;
        catMap[cat].clientCharged += charged;
        catMap[cat].clientRows += 1;
      }

      out.totals.paid += paid;
      out.totals.charged += charged;
      out.totals.rows += 1;
    }

    // Sort categories alphabetically by label for stable rendering (HR appears naturally among others)
    const ordered = {};
    Object.keys(out.categories)
      .sort((a, b) => {
        const la = String(out.categories[a]?.label || a);
        const lb = String(out.categories[b]?.label || b);

        const aIsOtros = la.trim().toLowerCase() === 'otros';
        const bIsOtros = lb.trim().toLowerCase() === 'otros';
        if (aIsOtros && !bIsOtros) return 1;
        if (!aIsOtros && bIsOtros) return -1;

        return la.localeCompare(lb);
      })
      .forEach((k) => (ordered[k] = out.categories[k]));

    out.categories = ordered;
    return out;
  }, [typeCategorySourceRows, categoryIdToName]);

  const categoryRows = useMemo(() => {
    const out = {};
    for (const r of typeCategorySourceRows) {
      const isHr = r?._kind === 'hr';
      if (isHr) continue;
      const catId = r.category_id != null && r.category_id !== '' ? String(r.category_id) : null;
      const cat = catId ? `id:${catId}` : 'uncategorized';
      if (!out[cat]) out[cat] = [];
      out[cat].push(r);
    }
    return out;
  }, [typeCategorySourceRows]);

  // ===== Helpers to read server-side summary blocks =====
  const serverSummary = report?.summary && typeof report.summary === 'object' ? report.summary : null;
  const serverCleaningSummary = report?.cleaning_summary && typeof report.cleaning_summary === 'object' ? report.cleaning_summary : null;
  const serverByCity = Array.isArray(report?.by_city) ? report.by_city : [];
  const monthResultCityOptions = useMemo(() => {
    const opts = [{ value: 'All', label: 'All' }];
    for (const c of serverByCity) {
      const raw = String(c?.city || '').trim();
      if (!raw) continue;
      // Normalize to match existing displayCity helper (Playa / Tulum / General)
      const low = raw.toLowerCase();
      let key = raw;
      if (low.includes('tulum')) key = 'Tulum';
      else if (low.includes('playa')) key = 'Playa';
      else if (low.includes('general') || low.includes('admin')) key = 'General';
      if (!opts.some(o => o.value === key)) {
        opts.push({ value: key, label: displayCity(key) });
      }
    }
    return opts;
  }, [serverByCity]);

  const selectedMonthResult = useMemo(() => {
    if (monthResultCity === 'All') return null;
    const hit = serverByCity.find((c) => {
      const raw = String(c?.city || '').toLowerCase();
      if (monthResultCity === 'Tulum') return raw.includes('tulum');
      if (monthResultCity === 'Playa') return raw.includes('playa');
      if (monthResultCity === 'General') return raw.includes('general') || raw.includes('admin');
      return String(c?.city || '') === monthResultCity;
    });
    return hit || null;
  }, [serverByCity, monthResultCity]);
  const monthResultTotalBalance = useMemo(() => {
    const b = serverSummary?.balance;
    const n = Number(b);
    if (!Number.isNaN(n)) return n;

    // Fallback: compute from the rows we already have (avoid referencing `summary` before init)
    let chargedTotal = 0;
    let paidTotal = 0;

    for (const r of filteredRows) {
      chargedTotal += Number(r.charged || 0) || 0;
      paidTotal += Number(r.paid || 0) || 0;
    }

    return chargedTotal - paidTotal;
  }, [serverSummary, filteredRows]);

  const monthResultBreakdown = useMemo(() => {
    const total = (Number(monthResultTotalBalance || 0) || 0) - (Number(hrPaidByCity.All) || 0);
    const list = [];

    for (const c of serverByCity) {
      const raw = String(c?.city || '').trim();
      if (!raw) continue;
      const low = raw.toLowerCase();
      let key = raw;
      if (low.includes('tulum')) key = 'Tulum';
      else if (low.includes('playa')) key = 'Playa';
      else if (low.includes('general') || low.includes('admin')) key = 'General';

      const balNum = Number(c?.balance);
      const balance = Number.isNaN(balNum) ? 0 : balNum;
      const hrPaid = Number(hrPaidByCity[key]) || 0;
      const balanceAdj = balance - hrPaid;
      const pct = total !== 0 ? (balanceAdj / total) * 100 : null;

      list.push({
        key,
        label: displayCity(key),
        balance: balanceAdj,
        pct,
      });
    }

    // Stable ordering: General, Playa, Tulum, Unknown, then alpha
    const order = ['General', 'Playa', 'Tulum', 'Unknown'];
    list.sort((a, b) => {
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return String(a.label).localeCompare(String(b.label));
    });

    return list;
  }, [serverByCity, monthResultTotalBalance, hrPaidByCity]);

  const monthResultLabel = useMemo(() => {
    if (monthResultCity === 'All') return 'Month result';
    return `Month result: ${displayCity(monthResultCity)}`;
  }, [monthResultCity]);
  // ===== Summary metrics (defensive: expected fields may be absent) =====
  const summary = useMemo(() => {
    let rowsCount = 0;
    let paidTotal = 0;
    let chargedTotal = 0;
    let expectedTotal = 0;
    let hasExpected = false;
    let pendingCount = 0;
    let reportedCount = 0;

    for (const r of filteredRows) {
      rowsCount += 1;
      const paid = Number(r.paid || 0) || 0;
      const charged = Number(r.charged || 0) || 0;
      paidTotal += paid;
      chargedTotal += charged;

      const expRaw = r.expected_cost ?? r.expectedCost ?? r.expected ?? null;
      if (expRaw != null && expRaw !== '') {
        const exp = Number(expRaw) || 0;
        if (!Number.isNaN(exp)) {
          expectedTotal += exp;
          hasExpected = true;
        }
      }

      const rs = String(r.report_status || '').toLowerCase();
      if (rs === 'pending') pendingCount += 1;
      if (rs === 'reported') reportedCount += 1;
    }

    const diff = hasExpected ? (chargedTotal - expectedTotal) : null;

    return {
      rowsCount,
      paidTotal,
      chargedTotal,
      expectedTotal: hasExpected ? expectedTotal : null,
      diff,
      pendingCount,
      reportedCount,
    };
  }, [filteredRows]);

  const issues = useMemo(() => {
    let missingUnitCount = 0;
    let pendingCount = 0;
    let clientRows = 0;
    let nonZeroBalanceRows = 0;

    // “over expected” only if expected values exist
    let overExpectedCount = 0;
    let hasExpected = false;

    for (const r of filteredRows) {
      if (!r.unit_id) missingUnitCount += 1;

      const rs = String(r.report_status || '').toLowerCase();
      if (rs === 'pending') pendingCount += 1;

      if (String(r.allocation_target || '').toLowerCase() === 'client') clientRows += 1;

      const paid = Number(r.paid || 0) || 0;
      const charged = Number(r.charged || 0) || 0;
      if (Math.abs((charged - paid)) > EPS) nonZeroBalanceRows += 1;

      const expRaw = r.expected_cost ?? r.expectedCost ?? r.expected ?? null;
      if (expRaw != null && expRaw !== '') {
        const exp = Number(expRaw) || 0;
        if (!Number.isNaN(exp)) {
          hasExpected = true;
          if (charged > exp) overExpectedCount += 1;
        }
      }
    }

    return {
      missingUnitCount,
      pendingCount,
      clientRows,
      nonZeroBalanceRows,
      overExpectedCount: hasExpected ? overExpectedCount : null,
    };
  }, [filteredRows, EPS]);

  return (
    <Box sx={{ pb: 3 }}>
      {error && (
        <Box sx={{ mb: 2 }}>
          <Typography color="error">{error}</Typography>
          <Divider sx={{ mt: 1 }} />
        </Box>
      )}

      {/* ===== Top Summary Card (HK – Monthly Result) ===== */}
      <Box sx={{ mt: 2, maxWidth: 950, ml: 0, mr: 'auto' }}>
        <Paper
          elevation={0}
          variant="outlined"
          sx={{
            p: 2,
            pt: 1.5,
            borderRadius: 2,
            position: 'relative',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: -10,
              left: 12,
              px: 0.5,
              backgroundColor: 'background.paper',
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              HK – Monthly Result
            </Typography>
          </Box>

          <Table
            size="small"
            aria-label="hk summary"
            sx={{
              mt: 0.5,
              '& td, & th': {
                borderBottom: 'none',
                py: 0.4,
                px: 0,
              },
            }}
          >
              <TableBody>
                <TableRow>
                  <TableCell> Total charged </TableCell>
                  <TableCell align="right">{fmtMoney(serverSummary?.charged ?? summary.chargedTotal)}</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell> Total paid </TableCell>
                  <TableCell align="right">{fmtMoney(
                    (Number(serverSummary?.paid ?? summary.paidTotal) || 0) +
                    (Number(serverSummary?.hr_amount ?? hrAgg.totalPaid) || 0)
                  )}</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        role="button"
                        tabIndex={0}
                        onClick={openMonthResultMenu}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openMonthResultMenu(e);
                          }
                        }}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          cursor: 'pointer',
                          userSelect: 'none',
                          borderRadius: 1,
                          px: 0.75,
                          py: 0.25,
                          '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' },
                        }}
                      >
                        <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>
                          {monthResultLabel}
                        </Typography>
                        <ExpandMoreIcon fontSize="small" sx={{ opacity: 0.8 }} />
                      </Box>

                      <Menu
                        anchorEl={monthResultAnchorEl}
                        open={monthResultMenuOpen}
                        onClose={closeMonthResultMenu}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                        PaperProps={{ sx: { minWidth: 260 } }}
                      >
                        <MenuItem
                          selected={monthResultCity === 'All'}
                          onClick={() => {
                            setMonthResultCity('All');
                            closeMonthResultMenu();
                          }}
                          sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>All</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtMoney((Number(monthResultTotalBalance) || 0) - (Number(hrPaidByCity.All) || 0))}</Typography>
                        </MenuItem>

                        {monthResultBreakdown.map((b) => (
                          <MenuItem
                            key={b.key}
                            selected={monthResultCity === b.key}
                            onClick={() => {
                              setMonthResultCity(b.key);
                              closeMonthResultMenu();
                            }}
                            sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}
                          >
                            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>
                                {b.label}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.1 }}>
                                {b.pct == null ? '—' : `${Math.round(b.pct)}%`}
                              </Typography>
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {fmtMoney(Number(b.balance) || 0)}
                            </Typography>
                          </MenuItem>
                        ))}
                      </Menu>
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmtMoney(
                      ((monthResultCity === 'All')
                        ? (Number(monthResultTotalBalance) || 0)
                        : (Number(selectedMonthResult?.balance) || 0))
                      -
                      ((monthResultCity === 'All')
                        ? (Number(hrPaidByCity.All) || 0)
                        : (Number(hrPaidByCity[monthResultCity]) || 0))
                  )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
        </Paper>
      </Box>

      {/* ===== Cards grid (match CCO2Results rhythm) ===== */}
      <Box sx={{ mt: 2, maxWidth: 950, ml: 0, mr: 'auto' }}>
        <Grid container spacing={2}>
          {/* 2) By Type / Category */}
          <Grid item xs={12} md={12}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                pt: 1.5,
                borderRadius: 2,
                border: '1px solid rgba(0,0,0,0.08)',
                position: 'relative',
                height: '100%',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: -10,
                  left: 12,
                  px: 0.5,
                  backgroundColor: 'background.paper',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  By Type / Category
                </Typography>
              </Box>

              <TableContainer>
                <Table size="small" aria-label="hk by category">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none' }}>Category</TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none' }}>Paid</TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none' }}>Charged</TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none' }}>Balance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* All totals */}
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', fontWeight: 700 }}>
                        All
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', fontWeight: 700 }}>
                        {fmtMoney(categoryAgg.totals.paid)}
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', fontWeight: 700 }}>
                        {fmtMoney(categoryAgg.totals.charged)}
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', fontWeight: 700 }}>
                        {fmtMoney((categoryAgg.totals.charged || 0) - (categoryAgg.totals.paid || 0))}
                      </TableCell>
                    </TableRow>

                    {/* HR (nested): HR expands to Salaries/Advances, each expands to employees */}
                    {hrAgg.totalRows > 0 && (() => {
                      const hrKey = 'cat::hr';
                      const openHr = !!expanded[hrKey];
                      const salKey = 'cat::hr:salary';
                      const advKey = 'cat::hr:advance';
                      const openSal = !!expanded[salKey];
                      const openAdv = !!expanded[advKey];

                      return (
                        <React.Fragment>
                          <TableRow hover onClick={() => toggleExpanded(hrKey)} sx={{ cursor: 'pointer' }}>
                            <TableCell sx={{ borderBottom: 'none', pl: 2, color: 'text.secondary' }}>
                              {openHr ? (
                                <ExpandLessIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                              ) : (
                                <ExpandMoreIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                              )}
                              HR
                            </TableCell>
                            <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                              {fmtMoney(hrAgg.totalPaid)}
                            </TableCell>
                            <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                              {fmtMoney(0)}
                            </TableCell>
                            <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                              {fmtMoney(0 - (hrAgg.totalPaid || 0))}
                            </TableCell>
                          </TableRow>

                          {openHr && (
                            <>
                              {/* Advances */}
                              <TableRow hover onClick={() => toggleExpanded(advKey)} sx={{ cursor: 'pointer' }}>
                                <TableCell sx={{ borderBottom: 'none', pl: 6, color: 'text.secondary' }}>
                                  {openAdv ? (
                                    <ExpandLessIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                  ) : (
                                    <ExpandMoreIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                  )}
                                  Advances
                                </TableCell>
                                <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                  {fmtMoney(hrAgg.byType.advance.paid)}
                                </TableCell>
                                <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                  {fmtMoney(0)}
                                </TableCell>
                                <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                  {fmtMoney(0 - (hrAgg.byType.advance.paid || 0))}
                                </TableCell>
                              </TableRow>

                              {openAdv && hrAgg.detailsByType.advance.map((e) => (
                                <TableRow key={`hr-adv-${e.employee_id ?? e.employee_shortname}`}>
                                  <TableCell sx={{ borderBottom: 'none', pl: 10, color: 'text.secondary' }}>
                                    <Typography variant="caption" color="text.secondary">
                                      <strong>{e.employee_shortname || '—'}</strong>
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                    <Typography variant="caption" color="text.secondary">{fmtMoney(e.amount)}</Typography>
                                  </TableCell>
                                  <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                    <Typography variant="caption" color="text.secondary">{fmtMoney(0)}</Typography>
                                  </TableCell>
                                  <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                    <Typography variant="caption" color="text.secondary">{fmtMoney(0 - (e.amount || 0))}</Typography>
                                  </TableCell>
                                </TableRow>
                              ))}

                              {/* Salaries */}
                              <TableRow hover onClick={() => toggleExpanded(salKey)} sx={{ cursor: 'pointer' }}>
                                <TableCell sx={{ borderBottom: 'none', pl: 6, color: 'text.secondary' }}>
                                  {openSal ? (
                                    <ExpandLessIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                  ) : (
                                    <ExpandMoreIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                  )}
                                  Salaries
                                </TableCell>
                                <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                  {fmtMoney(hrAgg.byType.salary.paid)}
                                </TableCell>
                                <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                  {fmtMoney(0)}
                                </TableCell>
                                <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                  {fmtMoney(0 - (hrAgg.byType.salary.paid || 0))}
                                </TableCell>
                              </TableRow>

                              {openSal && hrAgg.detailsByType.salary.map((e) => (
                                <TableRow key={`hr-sal-${e.employee_id ?? e.employee_shortname}`}>
                                  <TableCell sx={{ borderBottom: 'none', pl: 10, color: 'text.secondary' }}>
                                    <Typography variant="caption" color="text.secondary">
                                      <strong>{e.employee_shortname || '—'}</strong>
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                    <Typography variant="caption" color="text.secondary">{fmtMoney(e.amount)}</Typography>
                                  </TableCell>
                                  <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                    <Typography variant="caption" color="text.secondary">{fmtMoney(0)}</Typography>
                                  </TableCell>
                                  <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                    <Typography variant="caption" color="text.secondary">{fmtMoney(0 - (e.amount || 0))}</Typography>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </>
                          )}
                        </React.Fragment>
                      );
                    })()}

                    {/* Categories */}
                    {Object.entries(categoryAgg.categories).map(([cat, agg]) => {
                      const catKey = `cat::${cat}`;
                      const openCat = !!expanded[catKey];
                      return (
                        <React.Fragment key={catKey}>
                          <TableRow hover onClick={() => toggleExpanded(catKey)} sx={{ cursor: 'pointer' }}>
                            <TableCell sx={{ borderBottom: 'none', pl: 2, color: 'text.secondary' }}>
                              {openCat ? (
                                <ExpandLessIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                              ) : (
                                <ExpandMoreIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                              )}
                              {agg?.label || cat}
                            </TableCell>
                            <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                              {fmtMoney(agg.paid)}
                            </TableCell>
                            <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                              {fmtMoney(agg.charged)}
                            </TableCell>
                            <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                              {fmtMoney((agg.charged || 0) - (agg.paid || 0))}
                            </TableCell>
                          </TableRow>

                          {openCat && (categoryRows[cat] || [])
                            .slice()
                            .sort((a, b) => (a.unit_name || '').localeCompare(b.unit_name || ''))
                            .slice(0, 25)
                            .map((r, idx) => (
                              <TableRow key={`${catKey}::${idx}`}>
                                <TableCell sx={{ borderBottom: 'none', pl: 6, color: 'text.secondary' }}>
                                  <Typography variant="caption" color="text.secondary">
                                    <strong>{displayUnit(r)}</strong>
                                    {r.unit_name && r.description ? ' • ' : ''}
                                    {r.description || ''}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                  <Typography variant="caption" color="text.secondary">{fmtMoney(r.paid)}</Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                  <Typography variant="caption" color="text.secondary">{fmtMoney(r.charged)}</Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                  <Typography variant="caption" color="text.secondary">{fmtMoney((Number(r.charged || 0) || 0) - (Number(r.paid || 0) || 0))}</Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                        </React.Fragment>
                      );
                    })}

                    {Object.keys(categoryAgg.categories).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} sx={{ borderBottom: 'none' }}>
                          <Typography variant="body2" color="text.secondary">No data.</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* 3) Cleaning Results (Playa & Tulum) */}
          <Grid item xs={12}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                pt: 1.5,
                borderRadius: 2,
                border: '1px solid rgba(0,0,0,0.08)',
                position: 'relative',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: -10,
                  left: 12,
                  px: 0.5,
                  backgroundColor: 'background.paper',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  Cleaning Results
                </Typography>
              </Box>

              <TableContainer>
                <Table size="small" aria-label="hk cleaning results">
                  <TableBody>
                    {/* Playa del Carmen */}
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.5, fontWeight: 700 }}>
                        Playa del Carmen
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5, fontWeight: 700 }}>
                        {fmtMoney(serverSummary?.playa_cleanings?.result ?? 0)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.35, pl: 2, color: 'text.secondary' }}>
                        Charged (cat 7 + 8)
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.35, color: 'text.secondary' }}>
                        {fmtMoney(serverSummary?.playa_cleanings?.charged ?? 0)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.35, pl: 2, color: 'text.secondary' }}>
                        Laundry
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.35, color: 'text.secondary' }}>
                        {fmtMoney(serverSummary?.playa_cleanings?.laundry ?? 0)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.35, pl: 2, color: 'text.secondary' }}>
                        Fixed HR cost (Cleaner)
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.35, color: 'text.secondary' }}>
                        {fmtMoney(serverSummary?.playa_cleanings?.fixed_hr_cost ?? 0)}
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell colSpan={2} sx={{ borderBottom: 'none', py: 0.6 }}>
                        <Divider />
                      </TableCell>
                    </TableRow>

                    {/* Tulum */}
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.5, fontWeight: 700 }}>
                        Tulum
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5, fontWeight: 700 }}>
                        {fmtMoney(serverSummary?.tulum_cleanings?.result ?? 0)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.35, pl: 2, color: 'text.secondary' }}>
                        Charged (cat 7 + 8 + 14)
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.35, color: 'text.secondary' }}>
                        {fmtMoney(serverSummary?.tulum_cleanings?.charged ?? 0)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.35, pl: 2, color: 'text.secondary' }}>
                        Paid (incl. laundry)
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.35, color: 'text.secondary' }}>
                        {fmtMoney(serverSummary?.tulum_cleanings?.paid ?? 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* 4) Issues */}
          <Grid item xs={12}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                pt: 1.5,
                borderRadius: 2,
                border: '1px solid rgba(0,0,0,0.08)',
                position: 'relative',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: -10,
                  left: 12,
                  px: 0.5,
                  backgroundColor: 'background.paper',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  Issues
                </Typography>
              </Box>

              <TableContainer>
                <Table size="small" aria-label="hk issues">
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.5 }}>Pending report_status</TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5 }}>{fmtInt(issues.pendingCount)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.5 }}>Rows billed to Client</TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5 }}>{fmtInt(issues.clientRows)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.5 }}>Rows with non‑zero balance</TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5 }}>{fmtInt(issues.nonZeroBalanceRows)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.5 }}>Rows missing unit_id</TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5 }}>{fmtInt(issues.missingUnitCount)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ borderBottom: 'none', py: 0.5 }}>Over expected (charged &gt; expected)</TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5 }}>{issues.overExpectedCount == null ? '—' : fmtInt(issues.overExpectedCount)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
