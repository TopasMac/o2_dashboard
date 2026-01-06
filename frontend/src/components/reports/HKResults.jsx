import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Grid, FormControl, InputLabel, Select, MenuItem, Paper, IconButton } from '@mui/material';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Divider } from '@mui/material';
import api, { BACKEND_BASE } from '../../api';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PageScaffold from '../layout/PageScaffold';

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

export default function HKResults() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [month, setMonth] = useState(String(prev.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(prev.getFullYear()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({}); // { [categoryName]: boolean }
  const toggleExpanded = (cat) => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));
  // For cleaning result expand/collapse
  const [cleaningExpanded, setCleaningExpanded] = useState({});
  const toggleCleaning = (city) => setCleaningExpanded(prev => ({ ...prev, [city]: !prev[city] }));

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

  // Year options: current year ± 5
  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentYear - 5; y <= currentYear + 5; y++) {
    yearOptions.push(y.toString());
  }

  // Display city helper
  const displayCity = (c) => (c === 'General' ? 'Admin' : c === 'Playa' ? 'Playa del Carmen' : c);

  const buildUrl = () => {
    const base = `${BACKEND_BASE}/api/reports/hk/monthly-summary`;
    const params = new URLSearchParams();
    if (year) params.set('year', year);
    if (month) params.set('month', String(parseInt(month, 10))); // "08" -> 8
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = buildUrl();
      const { data } = await api.get(url, { headers: { Accept: 'application/json' } });
      setRows(Array.isArray(data) ? data : []);
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

  const actionsHeader = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel id="month-label">Month</InputLabel>
        <Select labelId="month-label" label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
          <MenuItem value=""><em>None</em></MenuItem>
          {monthOptions.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="year-label">Year</InputLabel>
        <Select labelId="year-label" label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
          <MenuItem value=""><em>None</em></MenuItem>
          {yearOptions.map(y => (
            <MenuItem key={y} value={y}>{y}</MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );

  return (
    <PageScaffold
      layout="table"
      withCard
      title="Housekeepers — Monthly Results"
      stickyHeader={actionsHeader}
      headerPlacement="inside"
    >
      <Box sx={{ pb: 3 }}>
        {error && (
          <Box sx={{ mb: 2 }}>
            <Typography color="error">{error}</Typography>
            <Divider sx={{ mt: 1 }} />
          </Box>
        )}

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
            const monthName = monthOptions.find(opt => opt.value === month)?.label || '';
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
    </PageScaffold>
  );
}
