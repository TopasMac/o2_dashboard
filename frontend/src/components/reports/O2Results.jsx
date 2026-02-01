import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Grid, Paper, Tabs, Tab } from '@mui/material';
import CCO2Results from './CCO2Results';
import HKResults from './HKResults';
import PageScaffold from '../layout/PageScaffold';
import api, { BACKEND_BASE } from '../../api';
import AppDrawer from '../common/AppDrawer';
import NewO2TransactionForm from '../forms/NewO2TransactionForm';
import EditO2TransactionForm from '../forms/EditO2TransactionForm';

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

  const [hkData, setHkData] = useState(null);
  const [hkLoading, setHkLoading] = useState(false);
  const [hkError, setHkError] = useState(null);

  const [tab, setTab] = useState(0);
  const [o2TxDrawerOpen, setO2TxDrawerOpen] = useState(false);
  const [editTxDrawerOpen, setEditTxDrawerOpen] = useState(false);
  const [editTx, setEditTx] = useState(null);
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

  useEffect(() => {
    // Only load HK data when user is on HK or All tab
    if (tab !== 1 && tab !== 2) return;

    let cancelled = false;

    async function loadHk() {
      setHkLoading(true);
      setHkError(null);
      try {
        const res = await api.get('/api/reports/hk/monthly-summary', {
          params: { year: Number(year), month: Number(month) },
        });
        if (cancelled) return;
        setHkData(res?.data ?? null);
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to load HK monthly summary', e);
        const msg = e?.response?.data?.message || e?.message || 'Failed to load';
        setHkError(msg);
        setHkData(null);
      } finally {
        if (!cancelled) setHkLoading(false);
      }
    }

    loadHk();
    return () => {
      cancelled = true;
    };
  }, [tab, year, month, reloadKey]);
  const openNewExpenseDrawer = () => {
    setO2TxDrawerOpen(true);
  };
  const openEditTxDrawer = (tx) => {
    if (!tx) return;
    setEditTx(tx);
    setEditTxDrawerOpen(true);
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
      const rawCity = t.city || t.cost_centre || t.costCentre || '';
      const city = normalizeCity(rawCity);
      // const date = t.date || null;

      if (!categories[category]) {
        categories[category] = { total: 0, cities: {} };
      }
      categories[category].total += amountNum;

      if (!categories[category].cities[city]) {
        categories[category].cities[city] = { total: 0, items: [] };
      }
      categories[category].cities[city].total += amountNum;
      categories[category].cities[city].items.push({ tx: t, description, amount: amountNum });
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
          {tab === 0 && loading && 'Loading…'}
          {tab === 0 && !loading && error && `Error: ${error}`}

          {(tab === 1 || tab === 2) && hkLoading && 'Loading…'}
          {(tab === 1 || tab === 2) && !hkLoading && hkError && `Error: ${hkError}`}
        </Typography>

        {tab === 0 && (
          <CCO2Results
            totals={totals}
            netMarginPct={netMarginPct}
            fmt={fmt}
            fmtDate={fmtDate}
            slices={slices}
            commissionSummary={commissionSummary}
            expandedCities={expandedCities}
            onToggleCity={toggleCity}
            otherIncome={otherIncome}
            expandedCentres={expandedCentres}
            onToggleCentre={toggleCentre}
            otherExpenses={otherExpenses}
            expandedExpenseCentres={expandedExpenseCentres}
            onToggleExpenseCentre={toggleExpenseCentre}
            expandedHrGroups={expandedHrGroups}
            onToggleHrGroup={toggleHrGroup}
            onOpenNewExpenseDrawer={openNewExpenseDrawer}
            onOpenEditTxDrawer={openEditTxDrawer}
          />
        )}

        {tab === 1 && (
          <HKResults
            year={year}
            month={month}
            yearMonth={hkData?.yearMonth || ym}
            rows={Array.isArray(hkData?.data) ? hkData.data : []}
            loading={hkLoading}
            error={hkError}
            fmt={fmt}
            fmtDate={fmtDate}
          />
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
     <AppDrawer
        open={editTxDrawerOpen}
        onClose={() => {
          setEditTxDrawerOpen(false);
          setEditTx(null);
        }}
        title="Edit Transaction"
        width={520}
      >
        {editTx ? (
          <EditO2TransactionForm
            id={editTx?.id ?? editTx?.transaction_id ?? editTx?.transactionId ?? null}
            onCancel={() => {
              setEditTxDrawerOpen(false);
              setEditTx(null);
            }}
            onSaved={() => {
              setEditTxDrawerOpen(false);
              setEditTx(null);
              setReloadKey((k) => k + 1);
            }}
          />
        ) : null}
      </AppDrawer>
    </PageScaffold>
  );
}
