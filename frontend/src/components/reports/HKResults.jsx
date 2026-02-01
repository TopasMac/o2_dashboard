import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Paper, IconButton } from '@mui/material';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Divider } from '@mui/material';
import api, { BACKEND_BASE } from '../../api';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

export default function HKResults({ year, month }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({}); // { [categoryName]: boolean }
  const toggleExpanded = (cat) => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));
  // For Incomes expand/collapse by city
  const [incomeCityOpen, setIncomeCityOpen] = useState({});
  const toggleIncomeCity = (key) => setIncomeCityOpen(prev => ({ ...prev, [key]: !prev[key] }));

  // Month options January to December
  const monthOptions = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];


  // Display city helper
  const displayCity = (c) => (c === 'General' ? 'Admin' : c === 'Playa' ? 'Playa del Carmen' : c);

  const buildUrl = () => {
    const base = `${BACKEND_BASE}/api/reports/hk/monthly-summary`;
    const params = new URLSearchParams();

    const y = year != null && year !== '' ? String(year) : '';
    const mNum = month != null && month !== '' ? Number(month) : NaN;

    if (y) params.set('year', y);
    if (!Number.isNaN(mNum) && mNum >= 1 && mNum <= 12) params.set('month', String(mNum));

    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = buildUrl();
      const { data } = await api.get(url, { headers: { Accept: 'application/json' } });
      const rowsArr = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setRows(rowsArr);
    } catch (e) {
      // 401s will be handled by api interceptor (auto-redirect). Surface other errors.
      const msg = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 180) : (e.message || String(e));
      setError(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [month, year]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => (r.unit_status || '').toLowerCase() !== 'alor');
  }, [rows]);

  // ===== Incomes: Cleaning fees =====
  const cleaningIncome = useMemo(() => {
    const out = {
      total: 0,
      cities: {
        Playa: { total: 0 },
        Tulum: { total: 0 },
      },
    };

    for (const r of filteredRows) {
      if ((r.category_name || '').toLowerCase() !== 'cleaning fee') continue;
      if ((r.category_type || '').toLowerCase() !== 'income') continue;

      const amount = Number(r.charged || 0) || 0;
      out.total += amount;

      const cityRaw = (r.city || '').toLowerCase();
      const cityKey = cityRaw.includes('tulum') ? 'Tulum' : (cityRaw.includes('playa') ? 'Playa' : null);
      if (!cityKey) continue;
      out.cities[cityKey].total += amount;
    }

    return out;
  }, [filteredRows]);

  // ===== Incomes: Mantenimientos (difference between paid and charged) =====
  const mantenimientoIncome = useMemo(() => {
    const out = {
      total: 0,
      cities: {
        Playa: { total: 0 },
        Tulum: { total: 0 },
      },
    };

    for (const r of filteredRows) {
      // transaction_category id:2 (backend uses category_id)
      const catId = r.category_id != null ? Number(r.category_id) : null;
      const catName = (r.category_name || '').toString().toLowerCase();
      const isMant = catId === 2 || catName === 'mantenimiento' || catName === 'mantenimientos';
      if (!isMant) continue;

      // Income is (charged - paid) but never negative (result is 0 or positive)
      // Example: paid=1400, charged=1650 => income=250
      const paid = Number(r.paid || 0) || 0;
      const charged = Number(r.charged || 0) || 0;
      const diff = Math.max(0, charged - paid);
      if (!diff) continue;

      out.total += diff;

      const cityRaw = (r.city || '').toLowerCase();
      const cityKey = cityRaw.includes('tulum') ? 'Tulum' : (cityRaw.includes('playa') ? 'Playa' : null);
      if (!cityKey) continue;
      out.cities[cityKey].total += diff;
    }

    return out;
  }, [filteredRows]);

  // Expand/collapse for Incomes groups
  const [cleaningsOpen, setCleaningsOpen] = useState(false);
  const [mantenimientosOpen, setMantenimientosOpen] = useState(false);

  // ===== City+Category summary =====
  const normalizeCity = (r) => {
    // Business rules provided:
    // - cost_centre Housekeepers_General → bucket "General"
    // - Otherwise use city (Playa del Carmen → "Playa", Tulum → "Tulum")
    // - Fallback "Unknown"
    const cc = (r.cost_centre || '').toLowerCase();
    if (cc === 'housekeepers_general' || cc === 'housekeepers general') return 'General';
    const c = (r.city || '').toLowerCase();
    if (c.includes('tulum')) return 'Tulum';
    if (c.includes('playa')) return 'Playa';
    return 'Unknown';
  };

  const cityCategory = useMemo(() => {
    // Structure: { [city]: { categories: { [name]: {paid, charged, rows, clientPaid, clientCharged, clientRows} }, totals: {...} } }
    const out = {};
    for (const r of filteredRows) {
      const city = normalizeCity(r);
      if (!out[city]) out[city] = { categories: {}, totals: { paid: 0, charged: 0, rows: 0 } };
      const cat = (r.category_name || r.category_id || 'Uncategorized').toString();
      const catMap = out[city].categories;
      if (!catMap[cat]) catMap[cat] = { paid: 0, charged: 0, rows: 0, clientPaid: 0, clientCharged: 0, clientRows: 0 };

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

      out[city].totals.paid += paid;
      out[city].totals.charged += charged;
      out[city].totals.rows += 1;
    }

    // Sort categories alphabetically for stable rendering
    for (const city of Object.keys(out)) {
      const ordered = {};
      Object.keys(out[city].categories).sort((a,b)=>a.localeCompare(b)).forEach(k=>ordered[k]=out[city].categories[k]);
      out[city].categories = ordered;
    }
    return out;
  }, [filteredRows]);

  const cityCategoryRows = useMemo(() => {
    const out = {};
    for (const r of filteredRows) {
      const city = normalizeCity(r);
      const cat = (r.category_name || r.category_id || 'Uncategorized').toString();
      if (!out[city]) out[city] = {};
      if (!out[city][cat]) out[city][cat] = [];
      out[city][cat].push(r);
    }
    return out;
  }, [filteredRows]);

  return (
    <Box sx={{ pb: 3 }}>
        {error && (
          <Box sx={{ mb: 2 }}>
            <Typography color="error">{error}</Typography>
            <Divider sx={{ mt: 1 }} />
          </Box>
        )}

        {/* ===== Incomes ===== */}
        <Box sx={{ mt: 2, maxWidth: 400 }}>
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
                Incomes
              </Typography>
            </Box>

            <Table size="small">
              <TableBody>
                <TableRow hover onClick={() => setCleaningsOpen(v => !v)} sx={{ cursor: 'pointer' }}>
                  <TableCell sx={{ borderBottom: 'none', fontWeight: 600 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {cleaningsOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      Cleanings
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ borderBottom: 'none', fontWeight: 600 }}>
                    {fmtMoney(cleaningIncome.total)}
                  </TableCell>
                </TableRow>

                {cleaningsOpen && (
                  <>
                    {/* Playa */}
                    <TableRow
                      hover
                      onClick={() => toggleIncomeCity('cleanings::Playa')}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ borderBottom: 'none', pl: 4, color: 'text.secondary' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {incomeCityOpen['cleanings::Playa'] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          Playa del Carmen
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                        {fmtMoney(cleaningIncome.cities.Playa.total)}
                      </TableCell>
                    </TableRow>

                    {/* Tulum */}
                    <TableRow
                      hover
                      onClick={() => toggleIncomeCity('cleanings::Tulum')}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ borderBottom: 'none', pl: 4, color: 'text.secondary' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {incomeCityOpen['cleanings::Tulum'] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          Tulum
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                        {fmtMoney(cleaningIncome.cities.Tulum.total)}
                      </TableCell>
                    </TableRow>
                  </>
                )}

                {/* Mantenimientos */}
                <TableRow hover onClick={() => setMantenimientosOpen(v => !v)} sx={{ cursor: 'pointer' }}>
                  <TableCell sx={{ borderBottom: 'none', fontWeight: 600, pt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {mantenimientosOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      Mantenimientos
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ borderBottom: 'none', fontWeight: 600, pt: 1 }}>
                    {fmtMoney(mantenimientoIncome.total)}
                  </TableCell>
                </TableRow>

                {mantenimientosOpen && (
                  <>
                    <TableRow
                      hover
                      onClick={() => toggleIncomeCity('mant::Playa')}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ borderBottom: 'none', pl: 4, color: 'text.secondary' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {incomeCityOpen['mant::Playa'] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          Playa del Carmen
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                        {fmtMoney(mantenimientoIncome.cities.Playa.total)}
                      </TableCell>
                    </TableRow>

                    <TableRow
                      hover
                      onClick={() => toggleIncomeCity('mant::Tulum')}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ borderBottom: 'none', pl: 4, color: 'text.secondary' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {incomeCityOpen['mant::Tulum'] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          Tulum
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                        {fmtMoney(mantenimientoIncome.cities.Tulum.total)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Box>

        {/* Monthly Summary by City & Category */}
        <>
          {Object.keys(cityCategory).length === 0 && (
            <Typography variant="body2" color="text.secondary">No data.</Typography>
          )}

          {/* --- General Summary and Table in flex container --- */}
          {(() => {
            // Compute balances for General, Playa, Tulum, and overall
            const generalData = cityCategory.General || {};
            const playaData = cityCategory.Playa || {};
            const tulumData = cityCategory.Tulum || {};
            const generalBalance = (generalData.totals?.charged || 0) - (generalData.totals?.paid || 0);
            const playaBalance = (playaData.totals?.charged || 0) - (playaData.totals?.paid || 0);
            const tulumBalance = (tulumData.totals?.charged || 0) - (tulumData.totals?.paid || 0);
            const totalBalance = generalBalance + playaBalance + tulumBalance;
            const mStr = month != null ? String(month).padStart(2, '0') : '';
            const monthName = monthOptions.find(opt => opt.value === mStr)?.label || '';
            if (!cityCategory.General) return null;
            return (
              <Box sx={{ display: 'flex', gap: 2 }}>
                {/* General Table Box */}
                {Object.entries(cityCategory)
                  .filter(([city]) => city === 'General')
                  .map(([city, data]) => (
                    <Box key={city} sx={{ position:'relative', border:'1px solid', borderColor:'divider', borderRadius:1, mb:3, mt:3, pt:2, width: '650px' }}>
                      <Typography
                        variant="subtitle1"
                        fontWeight={700}
                        sx={{ position: 'absolute', top: -14, left: 16, bgcolor: 'background.paper', px: 1 }}
                      >
                        {displayCity(city)}
                      </Typography>
                      <Box sx={{ px: 2, pb: 1, display: 'flex', justifyContent: 'flex-end', width: '650px' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ pr: '65px' }}>
                          Paid: {fmtMoney(data.totals.paid)} • Charged: {fmtMoney(data.totals.charged)} • <strong>Balance: {fmtMoney(data.totals.charged - data.totals.paid)}</strong>
                        </Typography>
                      </Box>

                      {/* Per-category grid: header then one row per category */}
                      <Box sx={{ px: 2, pb: 1, width: '670px' }}>
                        <Box sx={{ width: '600px', overflowX: 'auto' }}>
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 80px 80px 80px 80px',
                              columnGap: 0,
                              rowGap: 0.25,
                              alignItems: 'center',
                              px: 2,
                              py: 0,
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          >
                            {/* Header row */}
                            <Typography variant="body2" color="text.secondary" sx={{ pb: 0.5 }}>Description</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>Paid</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>Charged</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>Balance</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>Entries</Typography>

                            {/* Data rows */}
                            {Object.entries(data.categories).map(([cat, agg]) => (
                              <React.Fragment key={cat}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 0.5 }}>
                                  <Typography variant="caption" sx={{ py: 0 }}>{cat}</Typography>
                                  <IconButton
                                    aria-label={`toggle ${cat}`}
                                    aria-expanded={!!expanded[cat]}
                                    size="small"
                                    onClick={() => toggleExpanded(cat)}
                                  >
                                    {expanded[cat] ? <ExpandLessIcon fontSize="inherit" /> : <ExpandMoreIcon fontSize="inherit" />}
                                  </IconButton>
                                </Box>
                                <Typography variant="body2" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney(agg.paid)}</Typography>
                                <Typography variant="body2" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney(agg.charged)}</Typography>
                                <Typography variant="body2" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney(agg.charged - agg.paid)}</Typography>
                                <Typography variant="body2" sx={{ textAlign: 'center', py: 0 }}>
                                  {String(agg.rows).padStart(2, '0')}
                                </Typography>

                                {/* Expanded details rows */}
                                {expanded[cat] && (
                                  <>
                                    {(cityCategoryRows[city]?.[cat] || [])
                                      .slice()
                                      .sort((a, b) => (a.unit_name || '').localeCompare(b.unit_name || ''))
                                      .map((r, idx) => (
                                      <React.Fragment key={idx}>
                                        <Typography variant="caption" color="text.secondary" sx={{ py: 0 }}>
                                          {r.unit_name && <strong>{r.unit_name}</strong>}
                                          {r.unit_name && r.description ? ' • ' : ''}
                                          {r.description}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney(r.paid)}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney(r.charged)}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney((Number(r.charged||0)||0) - (Number(r.paid||0)||0))}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 0 }}>
                                          {r.rows ? String(r.rows).padStart(2, '0') : ''}
                                        </Typography>
                                      </React.Fragment>
                                    ))}
                                  </>
                                )}
                              </React.Fragment>
                            ))}
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                {/* Summary Box */}
                <Box
                  sx={{
                    minWidth: 420,
                    maxWidth: 460,
                    flexShrink: 0,
                    px: 2,
                    pb: 2,
                    pt: 2,
                    position: 'relative',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'rgba(0,150,136,0.06)',
                    alignSelf: 'flex-start',
                    mt: 3,
                    mb: 3,
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    fontWeight={700}
                    sx={{ position: 'absolute', top: -14, left: 16, px: 1, bgcolor: 'background.paper' }}
                  >
                    Summary
                  </Typography>
                  <Box sx={{ pt: 1 }}>
                    {/* Month result */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {monthName} Result
                      </Typography>
                      <Typography variant="subtitle1" fontWeight={700} sx={{ textAlign: 'right' }}>
                        {fmtMoney(totalBalance)}
                      </Typography>
                    </Box>
                    {/* Breakdown */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Typography variant="body2" color="text.secondary">Admin</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right' }}>{fmtMoney(generalBalance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Typography variant="body2" color="text.secondary">Playa del Carmen</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right' }}>{fmtMoney(playaBalance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Typography variant="body2" color="text.secondary">Tulum</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right' }}>{fmtMoney(tulumBalance)}</Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            );
          })()}

          {Object.entries(cityCategory)
            .filter(([city]) => city === 'Tulum')
            .map(([city, data]) => (
            <Box key={city} sx={{ position:'relative', border:'1px solid', borderColor:'divider', borderRadius:1, mb:4, mt:3, pt:2, width: '650px' }}>
              <Typography
                variant="subtitle1"
                fontWeight={700}
                sx={{ position: 'absolute', top: -14, left: 16, bgcolor: 'background.paper', px: 1 }}
              >
                {displayCity(city)}
              </Typography>
              <Box sx={{ px: 2, pb: 1, display: 'flex', justifyContent: 'flex-end', width: '650px' }}>
                <Typography variant="body2" color="text.secondary" sx={{ pr: '65px' }}>
                  Paid: {fmtMoney(data.totals.paid)} • Charged: {fmtMoney(data.totals.charged)} • <strong>Balance: {fmtMoney(data.totals.charged - data.totals.paid)}</strong>
                </Typography>
              </Box>

              {/* Per-category grid: header then one row per category */}
              <Box sx={{ px: 2, pb: 1, width: '670px' }}>
                <Box sx={{ width: '600px', overflowX: 'auto' }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 80px 80px 80px 80px',
                      columnGap: 0,
                      rowGap: 0.25,
                      alignItems: 'center',
                      px: 2,
                      py: 0,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Header row */}
                    <Typography variant="body2" color="text.secondary" sx={{ pb: 0.5 }}>Description</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>Paid</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>Charged</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>Balance</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>Entries</Typography>

                    {Object.entries(data.categories).map(([cat, agg]) => (
                      <React.Fragment key={cat}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 0.5 }}>
                          <Typography variant="caption" sx={{ py: 0 }}>{cat}</Typography>
                          <IconButton
                            aria-label={`toggle ${cat}`}
                            aria-expanded={!!expanded[cat]}
                            size="small"
                            onClick={() => toggleExpanded(cat)}
                          >
                            {expanded[cat] ? <ExpandLessIcon fontSize="inherit" /> : <ExpandMoreIcon fontSize="inherit" />}
                          </IconButton>
                        </Box>
                        <Typography variant="body2" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney(agg.paid)}</Typography>
                        <Typography variant="body2" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney(agg.charged)}</Typography>
                        <Typography variant="body2" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney(agg.charged - agg.paid)}</Typography>
                        <Typography variant="body2" sx={{ textAlign: 'center', py: 0 }}>
                          {String(agg.rows).padStart(2, '0')}
                        </Typography>

                        {expanded[cat] && (
                          <>
                            {(cityCategoryRows[city]?.[cat] || [])
                              .slice()
                              .sort((a, b) => (a.unit_name || '').localeCompare(b.unit_name || ''))
                              .map((r, idx) => (
                              <React.Fragment key={idx}>
                                <Typography variant="caption" color="text.secondary" sx={{ py: 0 }}>
                                  {r.unit_name && <strong>{r.unit_name}</strong>}
                                  {r.unit_name && r.description ? ' • ' : ''}
                                  {r.description}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney(r.paid)}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney(r.charged)}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', py: 0 }}>{fmtMoney((Number(r.charged||0)||0) - (Number(r.paid||0)||0))}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 0 }}>
                                  {r.rows ? String(r.rows).padStart(2, '0') : ''}
                                </Typography>
                              </React.Fragment>
                            ))}
                          </>
                        )}
                      </React.Fragment>
                    ))}
                  </Box>
                </Box>
              </Box>
            </Box>
          ))}
        </>
      </Box>
  );
}
