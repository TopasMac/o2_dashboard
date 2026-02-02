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

  // ===== City normalization (used by multiple aggregations) =====
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

        {/* ===== Per-Unit HK Results ===== */}
        <Box sx={{ mt: 2, maxWidth: 950, ml: 0, mr: 'auto' }}>
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
                Per-Unit HK Results
              </Typography>
            </Box>

            <TableContainer>
              <Table size="small" aria-label="per-unit hk results">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ borderBottom: 'none' }} />
                    <TableCell sx={{ borderBottom: 'none' }} />
                    <TableCell align="right" sx={{ borderBottom: 'none' }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell sx={{ borderBottom: 'none', pt: 0.5 }} />
                    <TableCell sx={{ borderBottom: 'none', pt: 0.5 }}>
                      <strong>Total</strong>
                    </TableCell>
                    <TableCell align="right" sx={{ borderBottom: 'none', pt: 0.5 }}>
                      <strong>{fmtMoney(perUnitByCity.totalNet)}</strong>
                    </TableCell>
                  </TableRow>

                  {perUnitByCity.cities.map((c) => {
                    const cityKey = `unitnet::${c.city}`;
                    const openCity = !!incomeCityOpen[cityKey];
                    return (
                      <React.Fragment key={c.city}>
                        <TableRow
                          hover
                          onClick={() => toggleIncomeCity(cityKey)}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell sx={{ borderBottom: 'none', pt: 1, width: 28 }}>
                            {openCity ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </TableCell>
                          <TableCell sx={{ borderBottom: 'none', pt: 1, fontWeight: 700 }}>
                            {displayCity(c.city)}
                          </TableCell>
                          <TableCell align="right" sx={{ borderBottom: 'none', pt: 1, fontWeight: 700 }}>
                            {fmtMoney(c.netTotal)}
                          </TableCell>
                        </TableRow>

                        {openCity && (
                          <>
                            {/* Housekeepers unit row if present and net significant */}
                            {c.hkUnit && Math.abs(Number(c.hkUnit.net) || 0) > EPS && (
                              <React.Fragment key={`hkunit-${c.hkUnit.unit_id}`}>
                                <TableRow
                                  hover
                                  onClick={() => toggleUnitOpen(c.hkUnit.unit_id)}
                                  sx={{ cursor: 'pointer' }}
                                >
                                  <TableCell sx={{ borderBottom: 'none', pl: 4, width: 28, color: 'text.secondary' }}>
                                    {unitOpen[c.hkUnit.unit_id] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                  </TableCell>
                                  <TableCell sx={{ borderBottom: 'none', pl: 0, color: 'text.secondary' }}>
                                    {c.hkUnit.unit_name || `Unit #${c.hkUnit.unit_id}`}
                                  </TableCell>
                                  <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                    {fmtMoney(c.hkUnit.net)}
                                  </TableCell>
                                </TableRow>
                                {unitOpen[c.hkUnit.unit_id] &&
                                  (c.hkUnit.rows || [])
                                    .slice()
                                    .sort((a, b) => {
                                      const as = a?.date ? String(a.date).slice(0, 10) : '';
                                      const bs = b?.date ? String(b.date).slice(0, 10) : '';
                                      if (!as && !bs) return 0;
                                      if (!as) return 1;
                                      if (!bs) return -1;
                                      return as.localeCompare(bs);
                                    })
                                    .map((r, idx) => {
                                      const paid = Number(r.paid || 0) || 0;
                                      const charged = Number(r.charged || 0) || 0;
                                      const net = charged - paid;
                                      return (
                                        <TableRow key={`${c.hkUnit.unit_id}::${idx}`}>
                                          <TableCell sx={{ borderBottom: 'none', pl: 8, pr: 1, color: 'text.secondary', width: 28 }} />
                                          <TableCell sx={{ borderBottom: 'none', pl: 0, color: 'text.secondary' }}>
                                            <Typography variant="caption" color="text.secondary">
                                              {r.date ? String(r.date).slice(0, 10) : '—'}
                                              {r.description ? ` • ${r.description}` : ''}
                                            </Typography>
                                          </TableCell>
                                          <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                            <Typography variant="caption" color="text.secondary">
                                              {fmtMoney(net)}
                                            </Typography>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                              </React.Fragment>
                            )}
                            {/* Real units */}
                            {c.units.map((u) => {
                              const openUnit = !!unitOpen[u.unit_id];
                              return (
                                <React.Fragment key={u.unit_id}>
                                  <TableRow
                                    hover
                                    onClick={() => toggleUnitOpen(u.unit_id)}
                                    sx={{ cursor: 'pointer' }}
                                  >
                                    <TableCell sx={{ borderBottom: 'none', pl: 4, width: 28, color: 'text.secondary' }}>
                                      {openUnit ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: 'none', pl: 0, color: 'text.secondary' }}>
                                      {u.unit_name || `Unit #${u.unit_id}`}
                                    </TableCell>
                                    <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                      {fmtMoney(u.net)}
                                    </TableCell>
                                  </TableRow>
                                  {openUnit &&
                                    (u.rows || [])
                                      .slice()
                                      .sort((a, b) => {
                                        const as = a?.date ? String(a.date).slice(0, 10) : '';
                                        const bs = b?.date ? String(b.date).slice(0, 10) : '';
                                        if (!as && !bs) return 0;
                                        if (!as) return 1;
                                        if (!bs) return -1;
                                        return as.localeCompare(bs);
                                      })
                                      .map((r, idx) => {
                                        const paid = Number(r.paid || 0) || 0;
                                        const charged = Number(r.charged || 0) || 0;
                                        const net = charged - paid;
                                        return (
                                          <TableRow key={`${u.unit_id}::${idx}`}>
                                            <TableCell sx={{ borderBottom: 'none', pl: 8, pr: 1, color: 'text.secondary', width: 28 }} />
                                            <TableCell sx={{ borderBottom: 'none', pl: 0, color: 'text.secondary' }}>
                                              <Typography variant="caption" color="text.secondary">
                                                {r.date ? String(r.date).slice(0, 10) : '—'}
                                                {r.description ? ` • ${r.description}` : ''}
                                              </Typography>
                                            </TableCell>
                                            <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                                              <Typography variant="caption" color="text.secondary">
                                                {fmtMoney(net)}
                                              </Typography>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                </React.Fragment>
                              );
                            })}
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {perUnitByCity.cities.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} sx={{ borderBottom: 'none' }}>
                        <Typography variant="body2" color="text.secondary">
                          No data for this month.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
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
