import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Grid, Paper, Tabs, Tab } from '@mui/material';
import O2Tooltip from '../common/O2Tooltip';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Divider, IconButton } from '@mui/material';
import PageScaffold from '../layout/PageScaffold';
import { BACKEND_BASE } from '../../api';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import AddIcon from '@mui/icons-material/Add';
import AppDrawer from '../common/AppDrawer';
import NewO2TransactionForm from '../forms/NewO2TransactionForm';

import YearMonthPicker from '../layout/components/YearMonthPicker';
import useYearMonth from '../layout/helpers/useYearMonth';


export default function O2Results() {
  const today = useMemo(() => new Date(), []);

  const initialYm = useMemo(() => {
    const thisMonth = today.getMonth() + 1; // 1..12
    const prevMonth = thisMonth === 1 ? 12 : thisMonth - 1;
    const prevYear = thisMonth === 1 ? today.getFullYear() - 1 : today.getFullYear();
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  }, [today]);

  const { ym, year, month, setYm } = useYearMonth(initialYm);

  const monthOptions = useMemo(() => {
    if (!ym) return [];
    const [yy, mm] = ym.split('-').map(Number);
    const base = new Date(yy, mm - 1, 1);

    const fmtVal = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const fmtLabel = (d) =>
      d.toLocaleString(undefined, { month: 'short', year: 'numeric' });

    const opts = [];
    for (let delta = -5; delta <= 1; delta++) {
      const d = new Date(base.getFullYear(), base.getMonth() + delta, 1);
      opts.push({ value: fmtVal(d), label: fmtLabel(d) });
    }
    return opts;
  }, [ym]);

  const [bookings, setBookings] = useState([]);
  const [slices, setSlices] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedCities, setExpandedCities] = useState(() => new Set());
  const [expandedCentres, setExpandedCentres] = useState(() => new Set());
  const [expandedExpenseCentres, setExpandedExpenseCentres] = useState(() => new Set());
  const [expandedHrGroups, setExpandedHrGroups] = useState(() => new Set());
  const [employeeLedger, setEmployeeLedger] = useState([]);

  const [tab, setTab] = useState(0);
  const [o2TxDrawerOpen, setO2TxDrawerOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Helper to normalize city labels for expenses
  const normalizeCity = (raw) => {
    const v = (raw || '').toString().trim();
    if (!v) return 'General';
    const lower = v.toLowerCase();
    if (lower.includes('playa')) return 'Playa';
    if (lower.includes('tulum')) return 'Tulum';
    if (lower.includes('general')) return 'General';
    return 'General';
  };

  const handleTabChange = (event, newValue) => {
    setTab(newValue);
  };
  const toggleExpenseCentre = (centre) => {
    setExpandedExpenseCentres(prev => {
      const next = new Set(prev);
      if (next.has(centre)) next.delete(centre); else next.add(centre);
      return next;
    });
  };
  const toggleHrGroup = (groupKey) => {
    setExpandedHrGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  };
  const otherExpenses = useMemo(() => {
    const hasTx = Array.isArray(transactions) && transactions.length > 0;
    const hasLedger = Array.isArray(employeeLedger) && employeeLedger.length > 0;
    if (!hasTx && !hasLedger) {
      return { total: 0, categories: {} };
    }

    const categories = {};
    let total = 0;

    // O2Transactions: expenses (Gasto / Expense / Egreso)
    if (hasTx) {
      for (const t of transactions) {
        const type = (t.type || '').toString().toLowerCase().trim();
        // accept common variants: "gasto", "expense", "egreso"
        if (!['gasto', 'expense', 'egreso'].includes(type)) continue; // only expenses

        const amountRaw = t.amount ?? t.total ?? 0;
        const amountNum = Number(amountRaw);
        if (!Number.isFinite(amountNum)) continue;
        total += amountNum;

        const category = t.category_name || t.categoryName || 'Uncategorized';
        const description = t.description || '';
        const dateRaw = t.date || t.entry_date || t.createdAt || t.created_at || null;
        const rawCity = t.city || t.cost_centre || t.costCentre || '';
        const city = normalizeCity(rawCity);

        if (!categories[category]) {
          categories[category] = { total: 0, cities: {} };
        }
        categories[category].total += amountNum;

        if (!categories[category].cities[city]) {
          categories[category].cities[city] = { total: 0, items: [] };
        }
        categories[category].cities[city].total += amountNum;
        categories[category].cities[city].items.push({ description, amount: amountNum, date: dateRaw });
      }
    }

    // Employee financial ledger: HR (salaries + advances)
    if (hasLedger) {
      const category = 'HR';
      const salariesAgg = new Map();
      const loansAgg = new Map();

      for (const row of employeeLedger) {
        const type = (row.type || '').toString().toLowerCase().trim();
        if (type !== 'salary' && type !== 'advance') continue;

        const amountRaw = row.amount ?? 0;
        const amountNum = Number(amountRaw);
        if (!Number.isFinite(amountNum)) continue;
        total += amountNum;

        const empName = row.employee_shortname || row.employee_shortName || null;
        const description = empName || '—';
        const dateRaw = row.entry_date || row.date || row.createdAt || row.created_at || null;

        const target = type === 'advance' ? loansAgg : salariesAgg;
        const key = description; // aggregate by employee shortname
        const existing = target.get(key);
        if (!existing) {
          target.set(key, {
            description,
            amount: amountNum,
            date: dateRaw,
          });
        } else {
          existing.amount += amountNum;
          // Keep the earliest known entry_date
          const a = existing.date ? String(existing.date).slice(0, 10) : '';
          const b = dateRaw ? String(dateRaw).slice(0, 10) : '';
          if (!a) existing.date = dateRaw;
          else if (b && b < a) existing.date = dateRaw;
        }
      }

      const toItems = (m) => Array.from(m.values());
      const salaryItems = toItems(salariesAgg);
      const loanItems = toItems(loansAgg);

      const salaryTotal = salaryItems.reduce((s, it) => s + Number(it.amount || 0), 0);
      const loanTotal = loanItems.reduce((s, it) => s + Number(it.amount || 0), 0);

      if (!categories[category]) {
        categories[category] = { total: 0, groups: {} };
      }

      categories[category].total += salaryTotal + loanTotal;
      categories[category].groups = {
        ...(categories[category].groups || {}),
        ...(loanItems.length > 0 ? { Loans: { total: loanTotal, items: loanItems } } : {}),
        ...(salaryItems.length > 0 ? { Salaries: { total: salaryTotal, items: salaryItems } } : {}),
      };
    }

    // Software category completeness check (AWS, Office, Automate, Beyond)
    // Attach missing list to the Software category object for UI rendering.
    const softwareKey = Object.keys(categories).find(
      (k) => (k || '').toString().trim().toLowerCase() === 'software'
    );
    if (softwareKey && categories[softwareKey]) {
      const allItems = [];
      const citiesObj = categories[softwareKey].cities || {};
      Object.values(citiesObj).forEach((cityObj) => {
        (cityObj.items || []).forEach((it) => allItems.push(it));
      });

      const haystack = allItems
        .map((it) => (it?.description || '').toString().toLowerCase())
        .join(' | ');

      const expected = [
        { label: 'AWS', patterns: ['aws', 'amazon web services'] },
        { label: 'Office', patterns: ['microsoft', 'office', 'o365'] },
        { label: 'Automate', patterns: ['power automate', 'powerautomate'] },
        { label: 'Beyond', patterns: ['beyond', 'beyond pricing'] },
      ];

      const missing = expected
        .filter((e) => !e.patterns.some((p) => haystack.includes(p)))
        .map((e) => e.label);

      categories[softwareKey].missingRecurring = missing;
    }

    return { total, categories };
  }, [transactions, employeeLedger]);

  useEffect(() => {
    const ac = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ year: String(year), month: String(month) });
        const endpoint = `${BACKEND_BASE}/api/reports/o2/monthly-summary?${params.toString()}`;
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setBookings(Array.isArray(data.bookings) ? data.bookings : []);
        setSlices(Array.isArray(data.slices) ? data.slices : []);
        // Transactions can arrive as `transactions` or `o2transactions` depending on backend shape
        const tx = Array.isArray(data.transactions)
          ? data.transactions
          : (Array.isArray(data.o2transactions) ? data.o2transactions : []);
        setTransactions(tx);
        setEmployeeLedger(Array.isArray(data.employeeLedger) ? data.employeeLedger : []);
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('Failed to load monthly summary', e);
          setError(e.message || 'Failed to load');
          setBookings([]);
          setSlices([]);
          setTransactions([]);
          setEmployeeLedger([]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => ac.abort();
  }, [year, month, reloadKey]);
  const openNewExpenseDrawer = () => {
    setO2TxDrawerOpen(true);
  };

  const commissionSummary = useMemo(() => {
    if (!slices || slices.length === 0) {
      return { total: 0, cities: {} };
    }

    // Build a lookup: unit_id -> { unit_name, city }
    const unitInfo = new Map();
    (bookings || []).forEach(b => {
      if (!unitInfo.has(b.unit_id)) {
        unitInfo.set(b.unit_id, { unit_name: b.unit_name || `Unit ${b.unit_id}`, city: b.city || 'Unknown' });
      }
    });

    const cities = {};
    let total = 0;

    for (const s of slices) {
      const unitId = s.unit_id;
      const commission = Number(s.o2_commission_in_month || 0);
      total += commission;
      const info = unitInfo.get(unitId) || { unit_name: `Unit ${unitId}`, city: 'Unknown' };
      let city = info.city || 'Unknown';
      if (city === 'Playa del Carmen') city = 'Playa';
      const unitName = info.unit_name || `Unit ${unitId}`;

      if (!cities[city]) cities[city] = { total: 0, units: {} };
      cities[city].total += commission;
      cities[city].units[unitName] = (cities[city].units[unitName] || 0) + commission;
    }

    return { total, cities };
  }, [bookings, slices]);

  const otherIncome = useMemo(() => {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return { total: 0, categories: {} };
    }

    const categories = {};
    let total = 0;

    for (const t of transactions) {
      // Accept both snake_case and camelCase fields from the API
      const type = (t.type || '').toString().toLowerCase();
      if (!['abono', 'ingreso'].includes(type)) continue; // consider Abono and Ingreso

      const amountRaw = t.amount ?? t.total ?? 0;
      const amountNum = Number(amountRaw);
      if (!Number.isFinite(amountNum)) continue;
      total += amountNum;

      const category = t.category_name || t.categoryName || 'Uncategorized';
      const description = t.description || '';
      const city = t.city || 'General';
      // const date = t.date || null;

      if (!categories[category]) {
        categories[category] = { total: 0, cities: {} };
      }
      categories[category].total += amountNum;

      if (!categories[category].cities[city]) {
        categories[category].cities[city] = { total: 0, items: [] };
      }
      categories[category].cities[city].total += amountNum;
      categories[category].cities[city].items.push({ description, amount: amountNum });
    }

    return { total, categories };
  }, [transactions]);

  const fmt = (value) => {
    const n = Number(value || 0);
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    const fixed = abs.toFixed(2); // e.g., 1234.56
    const [intPart, fracPart] = fixed.split('.');
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}$${withThousands},${fracPart}`;
  };

  const fmtDate = (raw) => {
    if (!raw) return '';
    // Accept YYYY-MM-DD or YYYY-MM-DD HH:mm:ss
    const s = String(raw);
    const iso = s.length >= 10 ? s.slice(0, 10) : s;
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [y, m, d] = parts;
    return `${d}/${m}`;
  };

  const totals = useMemo(() => {
    const income = Number(commissionSummary.total || 0) + Number(otherIncome.total || 0);
    const expenses = Number(otherExpenses.total || 0);
    const month = income - expenses;
    return { income, expenses, month };
  }, [commissionSummary.total, otherIncome.total, otherExpenses.total]);

  const netMarginPct = useMemo(() => {
    const income = Number(totals.income || 0);
    const net = Number(totals.month || 0);
    if (income <= 0) return 0;
    return (net / income) * 100;
  }, [totals.income, totals.month]);

  const toggleCity = (city) => {
    setExpandedCities(prev => {
      const next = new Set(prev);
      if (next.has(city)) next.delete(city); else next.add(city);
      return next;
    });
  };

  const toggleCentre = (centre) => {
    setExpandedCentres(prev => {
      const next = new Set(prev);
      if (next.has(centre)) next.delete(centre); else next.add(centre);
      return next;
    });
  };

  return (
    <PageScaffold
      title="Owners2 Results"
      layout="table"
      withCard
      headerPlacement="inside"
    >
      <Box sx={{ pb: 3 }}>
        {/* Filter box + Tabs in action row */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            border: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <YearMonthPicker
                value={ym}
                onChange={setYm}
                sx={{ maxWidth: 260 }}
                options={monthOptions}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={9}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: { xs: 'flex-start', md: 'flex-end' },
                }}
              >
                <Tabs
                  value={tab}
                  onChange={handleTabChange}
                  textColor="primary"
                  indicatorColor="primary"
                  variant="standard"
                >
                  <Tab label="Owners2" />
                  <Tab label="Housekeepers" />
                  <Tab label="All" />
                </Tabs>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {/* Loading/Error note (no counts) */}
        <Typography variant="body2" color="text.secondary">
          {loading && 'Loading…'}
          {!loading && error && `Error: ${error}`}
        </Typography>

        {tab === 0 && (
          <>
            {/* Single summary card: Income / Expenses / Net */}
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
                    Owners2 – Monthly Result
                  </Typography>
                </Box>

                <Table
                  size="small"
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
                    {/* Income */}
                    <TableRow>
                      <TableCell align="left" sx={{ pl: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Total Income
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {fmt(totals.income)}
                        </Typography>
                      </TableCell>
                    </TableRow>


                    {/* Expenses */}
                    <TableRow>
                      <TableCell align="left" sx={{ pl: 0, pt: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Total Expenses
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 0, pt: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {fmt(
                            Number.isFinite(Number(totals.expenses))
                              ? totals.expenses
                              : otherExpenses?.total ?? 0
                          )}
                        </Typography>
                      </TableCell>
                    </TableRow>

                    {/* Net result */}
                    <TableRow>
                      <TableCell align="left" sx={{ pl: 0, pt: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          Net Result
                          {Number.isFinite(netMarginPct) && (
                            <Typography
                              component="span"
                              variant="body2"
                              sx={{
                                ml: 1,
                                fontWeight: 400,
                                color: 'text.secondary',
                              }}
                            >
                              ({netMarginPct.toFixed(1).replace('.', ',')}%)
                            </Typography>
                          )}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 0, pt: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                          }}
                        >
                          {fmt(totals.month)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Paper>
            </Box>

            <Box sx={{ mt: 6 }}>
              <Grid container spacing={2}>
                {/* Left: Commissions (existing table) */}
                <Grid item xs={12} sm={6} md={4} lg={4}>
                  <Paper elevation={0} sx={{ p: 2, pt: 1, borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)', position: 'relative', maxWidth: 400 }}>
                    <Box sx={{ position: 'absolute', top: -10, left: 12, px: 0.5, backgroundColor: 'background.paper' }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>Commissions</Typography>
                    </Box>
                    <TableContainer>
                      <Table size="small" aria-label="commissions table">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ width: '60%', borderBottom: 'none' }} />
                            <TableCell align="right" sx={{ borderBottom: 'none' }} />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <TableRow>
                            <TableCell sx={{ borderBottom: 'none', pt: 0.5 }}><strong>Total</strong></TableCell>
                            <TableCell align="right" sx={{ borderBottom: 'none', pt: 0.5 }}><strong>{fmt(commissionSummary.total)}</strong></TableCell>
                          </TableRow>
                          {Object.entries(commissionSummary.cities).map(([city, entry]) => {
                            const open = expandedCities.has(city);
                            return (
                              <React.Fragment key={city}>
                                <TableRow hover>
                                  <TableCell sx={{ fontWeight: 600, borderBottom: 'none', py: 0.25, pl: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      <IconButton size="small" sx={{ p: 0, mr: 0.5 }} onClick={() => toggleCity(city)} aria-label={open ? 'Collapse' : 'Expand'}>
                                        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                      </IconButton>
                                      <Typography component="span" sx={{ ml: 0.25 }}>{city}</Typography>
                                      {(() => {
                                        const base = Number(commissionSummary.total || 0);
                                        const pct = base > 0 ? (Number(entry.total || 0) / base) * 100 : 0;
                                        const pctStr = pct.toFixed(1).replace('.', ',');
                                        return (
                                          <Typography component="span" sx={{ ml: 1, color: 'text.secondary', fontWeight: 400 }}>
                                            {pctStr}%
                                          </Typography>
                                        );
                                      })()}
                                    </Box>
                                  </TableCell>
                                  <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.primary' }}>{fmt(entry.total)}</TableCell>
                                </TableRow>
                                {open &&
                                  (() => {
                                    const unitEntries = Object.entries(entry.units || {});
                                    if (unitEntries.length === 0) {
                                      return null;
                                    }

                                    // Sort by amount (desc) to find top/bottom performers
                                    const sortedByAmount = [...unitEntries].sort(
                                      ([, aAmount], [, bAmount]) =>
                                        Number(bAmount || 0) - Number(aAmount || 0)
                                    );

                                    const topNames = new Set(
                                      sortedByAmount
                                        .slice(0, Math.min(3, sortedByAmount.length))
                                        .map(([name]) => name)
                                    );
                                    const bottomNames = new Set(
                                      sortedByAmount
                                        .slice(
                                          Math.max(sortedByAmount.length - 3, 0),
                                          sortedByAmount.length
                                        )
                                        .map(([name]) => name)
                                    );

                                    // Render alphabetically, but with background color
                                    return unitEntries
                                      .sort(([aName], [bName]) =>
                                        aName.localeCompare(bName)
                                      )
                                      .map(([unitName, amount]) => {
                                        let bg = 'transparent';
                                        if (topNames.has(unitName)) {
                                          bg = '#E8F5E9'; // light green
                                        } else if (bottomNames.has(unitName)) {
                                          bg = '#FFEBEE'; // light red
                                        }
                                        return (
                                          <TableRow key={unitName} sx={{ backgroundColor: bg }}>
                                            <TableCell
                                              sx={{
                                                pl: 6,
                                                borderBottom: 'none',
                                                color: 'text.secondary',
                                              }}
                                            >
                                              {unitName}
                                            </TableCell>
                                            <TableCell
                                              align="right"
                                              sx={{
                                                borderBottom: 'none',
                                                color: 'text.secondary',
                                              }}
                                            >
                                              {fmt(amount)}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      });
                                  })()}
                              </React.Fragment>
                            );
                          })}
                          {slices.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} sx={{ borderBottom: 'none' }}>
                                <Typography variant="body2" color="text.secondary">No data for this month yet.</Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>

                {/* Middle: Other Incomes */}
                <Grid item xs={12} sm={6} md={4} lg={4}>
                  <Paper elevation={0} sx={{ p: 2, pt: 1, borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)', position: 'relative', maxWidth: 400 }}>
                    <Box sx={{ position: 'absolute', top: -10, left: 12, px: 0.5, backgroundColor: 'background.paper' }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>Other Incomes</Typography>
                    </Box>
                    <TableContainer>
                      <Table size="small" aria-label="other incomes table">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ width: '60%', borderBottom: 'none' }} />
                            <TableCell align="right" sx={{ borderBottom: 'none' }} />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <TableRow>
                            <TableCell sx={{ borderBottom: 'none', pt: 0.5 }}>
                              <strong>Total</strong>
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{ borderBottom: 'none', pt: 0.5 }}
                            >
                              <strong>{fmt(otherIncome.total)}</strong>
                            </TableCell>
                          </TableRow>

                          {Object.entries(otherIncome.categories || {})
                            .sort(([aName], [bName]) => aName.localeCompare(bName))
                            .map(([categoryName, category]) => (
                              <React.Fragment key={categoryName}>
                                <TableRow hover>
                                  <TableCell
                                    sx={{
                                      fontWeight: 600,
                                      borderBottom: 'none',
                                      py: 0.25,
                                      pl: 1,
                                    }}
                                  >
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      <IconButton
                                        size="small"
                                        sx={{ p: 0, mr: 0.5 }}
                                        onClick={() => toggleCentre(categoryName)}
                                        aria-label={
                                          expandedCentres.has(categoryName)
                                            ? 'Collapse'
                                            : 'Expand'
                                        }
                                      >
                                        {expandedCentres.has(categoryName) ? (
                                          <ExpandLessIcon fontSize="small" />
                                        ) : (
                                          <ExpandMoreIcon fontSize="small" />
                                        )}
                                      </IconButton>
                                  <Typography component="span" sx={{ ml: 0.25 }}>
                                    {categoryName}
                                  </Typography>
                                  {Array.isArray(category?.missingRecurring) &&
                                    category.missingRecurring.length > 0 && (
                                      <Typography
                                        component="span"
                                        sx={{
                                          ml: 1,
                                          color: '#B26A00',
                                          fontWeight: 500,
                                          fontSize: 12,
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={`Missing: ${category.missingRecurring.join(', ')}`}
                                      >
                                        ⚠ Missing: {category.missingRecurring.join(', ')}
                                      </Typography>
                                    )}
                                    </Box>
                                  </TableCell>
                                  <TableCell
                                    align="right"
                                    sx={{ borderBottom: 'none', fontWeight: 600 }}
                                  >
                                    {fmt(category.total)}
                                  </TableCell>
                                </TableRow>

                                {expandedCentres.has(categoryName) &&
                                  Object.entries(category.cities).map(([cityName, cityObj]) => (
                                    <React.Fragment key={categoryName + '::' + cityName}>
                                      <TableRow>
                                        <TableCell sx={{ borderBottom: 'none', pl: 3, fontWeight: 600 }}>
                                          {cityName}
                                        </TableCell>
                                        <TableCell align="right" sx={{ borderBottom: 'none', fontWeight: 600 }}>
                                          {fmt(cityObj.total)}
                                        </TableCell>
                                      </TableRow>

                                      {cityObj.items.map((item, idx2) => (
                                        <TableRow key={categoryName + '::' + cityName + '::' + idx2}>
                                          <TableCell sx={{ borderBottom: 'none', pl: 6, color: 'text.secondary' }}>
                                            {item.description || '—'}
                                          </TableCell>
                                          <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                            {fmt(item.amount)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </React.Fragment>
                                  ))}
                              </React.Fragment>
                            ))}

                          {otherIncome.total === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} sx={{ borderBottom: 'none' }}>
                                <Typography variant="body2" color="text.secondary">
                                  No other incomes for this month.
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>

                {/* Right: Expenses */}
                <Grid item xs={12} sm={6} md={4} lg={4}>
                  <Paper elevation={0} sx={{ p: 2, pt: 1, pl: 1, borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)', position: 'relative', maxWidth: 400 }}>
                    <Box
                      sx={{
                        position: 'absolute',
                        top: -10,
                        left: 12,
                        px: 0.5,
                        backgroundColor: 'background.paper',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        Expenses
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={openNewExpenseDrawer}
                        aria-label="Add expense"
                        sx={{
                          p: 0.25,
                          color: '#4E8379',
                          '&:hover': { backgroundColor: 'rgba(78,131,121,0.10)' },
                        }}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    <TableContainer>
                      <Table size="small" aria-label="expenses table">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ width: '15%', borderBottom: 'none' }} />
                            <TableCell sx={{ width: '60%', borderBottom: 'none' }} />
                            <TableCell align="right" sx={{ borderBottom: 'none' }} />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <TableRow>
                            <TableCell sx={{ borderBottom: 'none', pt: 0.5 }} />
                            <TableCell sx={{ borderBottom: 'none', pt: 0.5 }}><strong>Total</strong></TableCell>
                            <TableCell align="right" sx={{ borderBottom: 'none', pt: 0.5 }}><strong>{fmt(otherExpenses.total)}</strong></TableCell>
                          </TableRow>

                          {Object.entries(otherExpenses.categories || {})
                            .sort(([aName], [bName]) => {
                              const A = (aName || '').toString();
                              const B = (bName || '').toString();

                              const aIsOtros = A.toLowerCase() === 'otros';
                              const bIsOtros = B.toLowerCase() === 'otros';

                              if (aIsOtros && !bIsOtros) return 1;
                              if (!aIsOtros && bIsOtros) return -1;

                              return A.localeCompare(B);
                            })
                            .map(([categoryName, category]) => (
                              <React.Fragment key={categoryName}>
                                <TableRow hover>
                                  <TableCell sx={{ borderBottom: 'none', py: 0.25 }} />
                                  <TableCell
                                    sx={{
                                      fontWeight: 600,
                                      borderBottom: 'none',
                                      py: 0.25,
                                      pl: 0,
                                    }}
                                  >
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      <IconButton
                                        size="small"
                                        sx={{ p: 0, mr: 0.5 }}
                                        onClick={() => toggleExpenseCentre(categoryName)}
                                        aria-label={
                                          expandedExpenseCentres.has(categoryName)
                                            ? 'Collapse'
                                            : 'Expand'
                                        }
                                      >
                                        {expandedExpenseCentres.has(categoryName) ? (
                                          <ExpandLessIcon fontSize="small" />
                                        ) : (
                                          <ExpandMoreIcon fontSize="small" />
                                        )}
                                      </IconButton>
                                      <Typography component="span" sx={{ ml: 0.25 }}>
                                        {categoryName}
                                      </Typography>
                                      {Array.isArray(category?.missingRecurring) &&
                                        category.missingRecurring.length > 0 && (
                                          <O2Tooltip title={`Missing: ${category.missingRecurring.join(', ')}`} placement="top">
                                            <Typography
                                              component="span"
                                              sx={{
                                                ml: 1,
                                                color: '#B26A00',
                                                fontWeight: 600,
                                                fontSize: 13,
                                                lineHeight: 1,
                                                cursor: 'help',
                                              }}
                                            >
                                              ⚠
                                            </Typography>
                                          </O2Tooltip>
                                        )}
                                    </Box>
                                  </TableCell>
                                  <TableCell
                                    align="right"
                                    sx={{ borderBottom: 'none', fontWeight: 600 }}
                                  >
                                    {fmt(category.total)}
                                  </TableCell>
                                </TableRow>

                                {expandedExpenseCentres.has(categoryName) &&
                                  ((categoryName || '').toString().trim().toLowerCase() === 'hr'
                                    ? Object.entries(category.groups || {}).map(([groupName, groupObj]) => {
                                        const groupKey = `${categoryName}::${groupName}`;
                                        const openGroup = expandedHrGroups.has(groupKey);
                                        const items = Array.isArray(groupObj?.items) ? groupObj.items : [];
                                        return (
                                          <React.Fragment key={groupKey}>
                                            <TableRow hover>
                                              <TableCell sx={{ borderBottom: 'none', pl: 0 }} />
                                              <TableCell
                                                sx={{
                                                  borderBottom: 'none',
                                                  pl: 1,
                                                  fontWeight: 600,
                                                }}
                                              >
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                  <IconButton
                                                    size="small"
                                                    sx={{ p: 0, mr: 0.5 }}
                                                    onClick={() => toggleHrGroup(groupKey)}
                                                    aria-label={openGroup ? 'Collapse' : 'Expand'}
                                                  >
                                                    {openGroup ? (
                                                      <ExpandLessIcon fontSize="small" />
                                                    ) : (
                                                      <ExpandMoreIcon fontSize="small" />
                                                    )}
                                                  </IconButton>
                                                  <Typography component="span" sx={{ ml: 0.25 }}>
                                                    {groupName}
                                                  </Typography>
                                                </Box>
                                              </TableCell>
                                              <TableCell
                                                align="right"
                                                sx={{
                                                  borderBottom: 'none',
                                                  fontWeight: 600,
                                                }}
                                              >
                                                {fmt(groupObj?.total || 0)}
                                              </TableCell>
                                            </TableRow>

                                            {openGroup &&
                                              [...items]
                                                .sort((a, b) => {
                                                  const as = a?.date ? String(a.date).slice(0, 10) : '';
                                                  const bs = b?.date ? String(b.date).slice(0, 10) : '';
                                                  if (!as && !bs) return 0;
                                                  if (!as) return 1;
                                                  if (!bs) return -1;
                                                  return as.localeCompare(bs);
                                                })
                                                .map((item, idx) => (
                                                  <TableRow key={groupKey + '::' + idx}>
                                                    <TableCell
                                                      sx={{
                                                        borderBottom: 'none',
                                                        pl: 0,
                                                        color: 'text.secondary',
                                                        pr: 1,
                                                      }}
                                                    >
                                                      {fmtDate(item.date)}
                                                    </TableCell>
                                                    <TableCell
                                                      sx={{
                                                        borderBottom: 'none',
                                                        color: 'text.secondary',
                                                        pl: 1,
                                                      }}
                                                    >
                                                      {item.description || '—'}
                                                    </TableCell>
                                                    <TableCell
                                                      align="right"
                                                      sx={{
                                                        borderBottom: 'none',
                                                        color: 'text.secondary',
                                                      }}
                                                    >
                                                      {fmt(item.amount)}
                                                    </TableCell>
                                                  </TableRow>
                                                ))}
                                          </React.Fragment>
                                        );
                                      })
                                    : Object.entries(category.cities || {}).map(([cityName, cityObj]) => (
                                        <React.Fragment key={categoryName + '::' + cityName}>
                                          {(categoryName || '').toString().trim().toLowerCase() !== 'software' && (
                                            <TableRow>
                                              <TableCell sx={{ borderBottom: 'none', pl: 0 }} />
                                              <TableCell
                                                sx={{
                                                  borderBottom: 'none',
                                                  pl: 1,
                                                  fontWeight: 600,
                                                }}
                                              >
                                                {cityName}
                                              </TableCell>
                                              <TableCell
                                                align="right"
                                                sx={{
                                                  borderBottom: 'none',
                                                  fontWeight: 600,
                                                }}
                                              >
                                                {fmt(cityObj.total)}
                                              </TableCell>
                                            </TableRow>
                                          )}

                                          {[...(cityObj.items || [])]
                                            .sort((a, b) => {
                                              const as = a?.date ? String(a.date).slice(0, 10) : '';
                                              const bs = b?.date ? String(b.date).slice(0, 10) : '';
                                              if (!as && !bs) return 0;
                                              if (!as) return 1; // a has no date -> last
                                              if (!bs) return -1; // b has no date -> last
                                              return as.localeCompare(bs);
                                            })
                                            .map((item, idx) => (
                                              <TableRow key={categoryName + '::' + cityName + '::' + idx}>
                                                <TableCell
                                                  sx={{
                                                    borderBottom: 'none',
                                                    pl: 0,
                                                    color: 'text.secondary',
                                                    pr: 1,
                                                  }}
                                                >
                                                  {fmtDate(item.date)}
                                                </TableCell>
                                                <TableCell
                                                  sx={{
                                                    borderBottom: 'none',
                                                    color: 'text.secondary',
                                                    pl: 1,
                                                  }}
                                                >
                                                  {item.description || '—'}
                                                </TableCell>
                                                <TableCell
                                                  align="right"
                                                  sx={{
                                                    borderBottom: 'none',
                                                    color: 'text.secondary',
                                                  }}
                                                >
                                                  {fmt(item.amount)}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                        </React.Fragment>
                                      )))}
                              </React.Fragment>
                            ))}

                          {otherExpenses.total === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} sx={{ borderBottom: 'none' }}>
                                <Typography variant="body2" color="text.secondary">No expenses for this month.</Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
          </>
        )}

        {tab === 1 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Housekeepers view will be added here.
            </Typography>
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Combined view (Owners2 + Housekeepers) will be added here.
            </Typography>
          </Box>
        )}
      </Box>
      <AppDrawer
        open={o2TxDrawerOpen}
        onClose={() => setO2TxDrawerOpen(false)}
        title="New Expense"
        width={520}
      >
        <NewO2TransactionForm
          defaultType="expense"
          onCancel={() => setO2TxDrawerOpen(false)}
          onSuccess={() => {
            setO2TxDrawerOpen(false);
            setReloadKey((k) => k + 1);
          }}
        />
      </AppDrawer>
    </PageScaffold>
  );
}
