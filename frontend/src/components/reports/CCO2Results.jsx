import React from 'react';
import {
  Box,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import AddIcon from '@mui/icons-material/Add';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import O2Tooltip from '../common/O2Tooltip';

/**
 * CCO2Results
 *
 * Extracted Owners2 tab body from O2Results.jsx.
 *
 * NOTE: This component is intentionally a presentational “tab body” component.
 * It should NOT render PageScaffold / Tabs / Month picker.
 */
export default function CCO2Results(props) {
  const {
    // numbers & formatters
    totals,
    otherExpenses,
    otherIncome,
    commissionSummary,
    netMarginPct,
    fmt,
    fmtDate,

    // data
    slices,

    // UI state
    expandedCities,
    expandedCentres,
    expandedExpenseCentres,
    expandedHrGroups,

    // actions
    toggleCity,
    toggleCentre,
    toggleExpenseCentre,
    toggleHrGroup,
    openNewExpenseDrawer,
    openEditTxDrawer,
  } = props;

  const renderExpenseDetails = (categoryName, category) => {
    const catKey = (categoryName || '').toString().trim().toLowerCase();

    // HR: render groups that expand/collapse
    if (catKey === 'hr') {
      return Object.entries(category.groups || {}).map(([groupName, groupObj]) => {
        const groupKey = `${categoryName}::${groupName}`;
        const openGroup = expandedHrGroups.has(groupKey);
        const items = Array.isArray(groupObj?.items) ? groupObj.items : [];

        return (
          <React.Fragment key={groupKey}>
            <TableRow hover>
              <TableCell sx={{ borderBottom: 'none', pl: 0 }} />
              <TableCell sx={{ borderBottom: 'none', pl: 1, fontWeight: 600 }}>
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
              <TableCell align="right" sx={{ borderBottom: 'none', fontWeight: 600 }}>
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
                    <TableCell sx={{ borderBottom: 'none', pl: 0, color: 'text.secondary', pr: 1 }}>
                      {fmtDate(item.date)}
                    </TableCell>
                    <TableCell sx={{ borderBottom: 'none', color: 'text.secondary', pl: 1 }}>
                      {item.description || '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                      {fmt(item.amount)}
                    </TableCell>
                  </TableRow>
                ))}
          </React.Fragment>
        );
      });
    }

    // Default: render cities and items
    return Object.entries(category.cities || {}).map(([cityName, cityObj]) => (
      <React.Fragment key={categoryName + '::' + cityName}>
        {catKey !== 'software' && (
          <TableRow>
            <TableCell sx={{ borderBottom: 'none', pl: 0 }} />
            <TableCell sx={{ borderBottom: 'none', pl: 1, fontWeight: 600 }}>
              {cityName}
            </TableCell>
            <TableCell align="right" sx={{ borderBottom: 'none', fontWeight: 600 }}>
              {fmt(cityObj.total)}
            </TableCell>
          </TableRow>
        )}

        {[...(cityObj.items || [])]
          .sort((a, b) => {
            const as = a?.date ? String(a.date).slice(0, 10) : '';
            const bs = b?.date ? String(b.date).slice(0, 10) : '';
            if (!as && !bs) return 0;
            if (!as) return 1;
            if (!bs) return -1;
            return as.localeCompare(bs);
          })
          .map((item, idx) => (
            <TableRow key={categoryName + '::' + cityName + '::' + idx}>
              <TableCell sx={{ borderBottom: 'none', pl: 0, color: 'text.secondary', pr: 1 }}>
                {fmtDate(item.date)}
              </TableCell>
              <TableCell sx={{ borderBottom: 'none', color: 'text.secondary', pl: 1 }}>
                {item.description || '—'}
              </TableCell>
              <TableCell align="right" sx={{ borderBottom: 'none', color: 'text.secondary' }}>
                {fmt(item.amount)}
              </TableCell>
            </TableRow>
          ))}
      </React.Fragment>
    ));
  };

  return (
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
            <Paper
              elevation={0}
              sx={{
                p: 2,
                pt: 1,
                borderRadius: 2,
                border: '1px solid rgba(0,0,0,0.08)',
                position: 'relative',
                maxWidth: 400,
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
                  Commissions
                </Typography>
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
                      <TableCell sx={{ borderBottom: 'none', pt: 0.5 }}>
                        <strong>Total</strong>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ borderBottom: 'none', pt: 0.5 }}
                      >
                        <strong>{fmt(commissionSummary.total)}</strong>
                      </TableCell>
                    </TableRow>
                    {Object.entries(commissionSummary.cities).map(([city, entry]) => {
                      const open = expandedCities.has(city);
                      return (
                        <React.Fragment key={city}>
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
                                  onClick={() => toggleCity(city)}
                                  aria-label={open ? 'Collapse' : 'Expand'}
                                >
                                  {open ? (
                                    <ExpandLessIcon fontSize="small" />
                                  ) : (
                                    <ExpandMoreIcon fontSize="small" />
                                  )}
                                </IconButton>
                                <Typography component="span" sx={{ ml: 0.25 }}>
                                  {city}
                                </Typography>
                                {(() => {
                                  const base = Number(commissionSummary.total || 0);
                                  const pct =
                                    base > 0
                                      ? (Number(entry.total || 0) / base) * 100
                                      : 0;
                                  const pctStr = pct.toFixed(1).replace('.', ',');
                                  return (
                                    <Typography
                                      component="span"
                                      sx={{
                                        ml: 1,
                                        color: 'text.secondary',
                                        fontWeight: 400,
                                      }}
                                    >
                                      {pctStr}%
                                    </Typography>
                                  );
                                })()}
                              </Box>
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{ borderBottom: 'none', color: 'text.primary' }}
                            >
                              {fmt(entry.total)}
                            </TableCell>
                          </TableRow>
                          {open &&
                            (() => {
                              // Support both shapes:
                              // 1) legacy: entry.units = { [unitLabel]: amount }
                              // 2) new:    entry.units = [ { unit_id, unit_name, amount } ]

                              const IGNORE_HIGHLIGHT_UNIT_IDS = new Set([10, 11]);
                              const IGNORE_HIGHLIGHT_UNIT_NAMES = new Set(['sunrise', 'sunset']);

                              const shouldIgnoreHighlight = (u) => {
                                const id = u?.unit_id != null ? Number(u.unit_id) : null;
                                const name = (u?.unit_name ?? u?.name ?? '').toString().trim().toLowerCase();
                                return (id != null && IGNORE_HIGHLIGHT_UNIT_IDS.has(id)) || (name !== '' && IGNORE_HIGHLIGHT_UNIT_NAMES.has(name));
                              };

                              const normalizeUnits = (units) => {
                                if (Array.isArray(units)) {
                                  return units
                                    .map((u) => {
                                      const unitId = u?.unit_id != null ? Number(u.unit_id) : null;
                                      const amount = Number(u?.amount ?? u?.o2_commission ?? 0);
                                      const unitNameRaw = (u?.unit_name ?? u?.name ?? '').toString().trim();
                                      const unitName = unitNameRaw !== ''
                                        ? unitNameRaw
                                        : unitId != null
                                          ? `Unit ${unitId}`
                                          : '—';
                                      return {
                                        unit_id: Number.isFinite(unitId) ? unitId : null,
                                        unit_name: unitName,
                                        amount: Number.isFinite(amount) ? amount : 0,
                                      };
                                    })
                                    .filter((u) => u.unit_name && u.unit_name !== '—');
                                }

                                // legacy object map
                                const parseUnitIdFromLabel = (label) => {
                                  if (label == null) return null;
                                  const s = String(label).trim();
                                  // Common legacy format: "Unit 10" or just "10"
                                  const m = s.match(/^(?:unit\s*)?(\d+)$/i) || s.match(/^unit\s+(\d+)$/i);
                                  if (m && m[1]) {
                                    const n = Number(m[1]);
                                    return Number.isFinite(n) ? n : null;
                                  }
                                  return null;
                                };

                                return Object.entries(units || {}).map(([label, amt]) => {
                                  const unitId = parseUnitIdFromLabel(label);
                                  const amount = Number(amt || 0);
                                  const unitName = String(label || '').trim() || (unitId != null ? `Unit ${unitId}` : '—');
                                  return {
                                    unit_id: unitId,
                                    unit_name: unitName,
                                    amount: Number.isFinite(amount) ? amount : 0,
                                  };
                                });
                              };

                              const unitRows = normalizeUnits(entry.units);
                              if (unitRows.length === 0) return null;

                              const eligibleForRanking = unitRows.filter((u) => !shouldIgnoreHighlight(u));
                              const rowsForRanking = eligibleForRanking.length > 0 ? eligibleForRanking : unitRows;

                              const sortedByAmount = [...rowsForRanking].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));

                              const topKeys = new Set(
                                sortedByAmount
                                  .slice(0, Math.min(3, sortedByAmount.length))
                                  .map((u) => String(u.unit_id ?? u.unit_name))
                              );

                              const bottomKeys = new Set(
                                sortedByAmount
                                  .slice(Math.max(sortedByAmount.length - 3, 0), sortedByAmount.length)
                                  .map((u) => String(u.unit_id ?? u.unit_name))
                              );

                              // Render alphabetically by unit_name, but with highlight based on ranking
                              return [...unitRows]
                                .sort((a, b) => String(a.unit_name).localeCompare(String(b.unit_name)))
                                .map((u) => {
                                  const ignored = shouldIgnoreHighlight(u);
                                  const keyForRank = String(u.unit_id ?? u.unit_name);

                                  let bg = 'transparent';
                                  if (!ignored && topKeys.has(keyForRank)) {
                                    bg = '#E8F5E9'; // light green
                                  } else if (!ignored && bottomKeys.has(keyForRank)) {
                                    bg = '#FFEBEE'; // light red
                                  }

                                  const rowKey = u.unit_id != null ? `${u.unit_id}` : u.unit_name;

                                  return (
                                    <TableRow key={rowKey} sx={{ backgroundColor: bg }}>
                                      <TableCell
                                        sx={{
                                          pl: 6,
                                          borderBottom: 'none',
                                          color: 'text.secondary',
                                        }}
                                      >
                                        {u.unit_name}
                                      </TableCell>
                                      <TableCell
                                        align="right"
                                        sx={{
                                          borderBottom: 'none',
                                          color: 'text.secondary',
                                        }}
                                      >
                                        {fmt(u.amount)}
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
                          <Typography variant="body2" color="text.secondary">
                            No data for this month yet.
                          </Typography>
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
            <Paper
              elevation={0}
              sx={{
                p: 2,
                pt: 1,
                borderRadius: 2,
                border: '1px solid rgba(0,0,0,0.08)',
                position: 'relative',
                maxWidth: 400,
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
                  Other Incomes
                </Typography>
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
                              <Box
                                sx={{ display: 'flex', alignItems: 'center' }}
                              >
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
                                      title={`Missing: ${category.missingRecurring.join(
                                        ', '
                                      )}`}
                                    >
                                      ⚠ Missing:{' '}
                                      {category.missingRecurring.join(', ')}
                                    </Typography>
                                  )}
                              </Box>
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                borderBottom: 'none',
                                fontWeight: 600,
                              }}
                            >
                              {fmt(category.total)}
                            </TableCell>
                          </TableRow>

                          {expandedCentres.has(categoryName) &&
                            Object.entries(category.cities).map(
                              ([cityName, cityObj]) => (
                                <React.Fragment
                                  key={categoryName + '::' + cityName}
                                >
                                  <TableRow>
                                    <TableCell
                                      sx={{
                                        borderBottom: 'none',
                                        pl: 3,
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

                                  {cityObj.items.map((item, idx2) => {
                                    const tx = item?.tx || null;
                                    const txId =
                                      tx &&
                                      (tx.id ??
                                        tx.transaction_id ??
                                        tx.transactionId);
                                    const clickable = Boolean(txId);

                                    return (
                                      <TableRow
                                        key={
                                          categoryName +
                                          '::' +
                                          cityName +
                                          '::' +
                                          idx2
                                        }
                                        hover={clickable}
                                        onClick={() => {
                                          if (!clickable) return;
                                          openEditTxDrawer(tx);
                                        }}
                                        sx={{
                                          cursor: clickable
                                            ? 'pointer'
                                            : 'default',
                                        }}
                                      >
                                        <TableCell
                                          sx={{
                                            borderBottom: 'none',
                                            pl: 6,
                                            color: 'text.secondary',
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
                                    );
                                  })}
                                </React.Fragment>
                              )
                            )}
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
            <Paper
              elevation={0}
              sx={{
                p: 2,
                pt: 1,
                pl: 1,
                borderRadius: 2,
                border: '1px solid rgba(0,0,0,0.08)',
                position: 'relative',
                maxWidth: 400,
              }}
            >
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
                      <TableCell sx={{ borderBottom: 'none', pt: 0.5 }}>
                        <strong>Total</strong>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ borderBottom: 'none', pt: 0.5 }}
                      >
                        <strong>{fmt(otherExpenses.total)}</strong>
                      </TableCell>
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
                              <Box
                                sx={{ display: 'flex', alignItems: 'center' }}
                              >
                                <IconButton
                                  size="small"
                                  sx={{ p: 0, mr: 0.5 }}
                                  onClick={() =>
                                    toggleExpenseCentre(categoryName)
                                  }
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
                                    <O2Tooltip
                                      title={`Missing: ${category.missingRecurring.join(
                                        ', '
                                      )}`}
                                      placement="top"
                                    >
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
                              sx={{
                                borderBottom: 'none',
                                fontWeight: 600,
                              }}
                            >
                              {fmt(category.total)}
                            </TableCell>
                          </TableRow>

                          {expandedExpenseCentres.has(categoryName) && renderExpenseDetails(categoryName, category)}
                        </React.Fragment>
                      ))}

                    {otherExpenses.total === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} sx={{ borderBottom: 'none' }}>
                          <Typography variant="body2" color="text.secondary">
                            No expenses for this month.
                          </Typography>
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
  );
}