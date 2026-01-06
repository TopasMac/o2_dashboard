import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  IconButton,
  List,
  ListItem,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import api from '../../api';

/**
 * Drawer used in Unit Monthly Report page to prepare payment requests.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - yearMonth: string (YYYY-MM)
 */
const UnitReportPayRequestDrawer = ({ open, onClose, yearMonth }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [pdfBusy, setPdfBusy] = useState(false);

  const hasSelection = selectedIds.length > 0;

  const formattedMonth = useMemo(() => {
    if (!yearMonth) return '';
    const [y, m] = yearMonth.split('-');
    return `${m}/${y}`;
  }, [yearMonth]);

  const loadCandidates = async () => {
    if (!yearMonth || !open) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/reports/unit-monthly/payment-candidates', {
        params: { yearMonth },
      });
      const rows = Array.isArray(res?.data?.items) ? res.data.items : [];
      setItems(rows);

      // Preselect units where paymentRequested is true
      const preselected = rows
        .filter((r) => r.paymentRequested)
        .map((r) => r.unitId)
        .filter((id) => typeof id === 'number');
      setSelectedIds(preselected);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load payment candidates', e);
      setError(e?.response?.data?.error || e?.message || 'Failed to load payment candidates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadCandidates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, yearMonth]);

  const handleToggle = (unitId) => {
    setSelectedIds((prev) => {
      if (prev.includes(unitId)) {
        return prev.filter((id) => id !== unitId);
      }
      return [...prev, unitId];
    });
  };

  const handleSelectAll = () => {
    const allIds = items
      .filter((r) => !r.paymentIssued && r.closingBalance > 0)
      .map((r) => r.unitId)
      .filter((id) => typeof id === 'number');
    setSelectedIds(allIds);
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleGeneratePdfClick = async () => {
    if (!hasSelection || !yearMonth) return;

    const ym = yearMonth.trim();
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      return;
    }

    const payload = {
      yearMonth: ym,
      unitIds: selectedIds,
    };

    setPdfBusy(true);
    setError(null);

    try {
      const res = await api.post(
        '/api/reports/unit-monthly/payment-request/pdf',
        payload,
        { responseType: 'blob' },
      );

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payment_request_${ym}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate payment request PDF', e);
      setError(e?.response?.data?.error || e?.message || 'Failed to generate PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const drawerWidth = 420;

  const totalBalance = useMemo(() => {
    if (!items || items.length === 0) return 0;
    return items.reduce((sum, row) => {
      const val = typeof row.closingBalance === 'number' ? row.closingBalance : 0;
      return sum + val;
    }, 0);
  }, [items]);

  const selectedTotal = useMemo(() => {
    if (!items || items.length === 0 || selectedIds.length === 0) return 0;
    return items.reduce((sum, row) => {
      const val = typeof row.closingBalance === 'number' ? row.closingBalance : 0;
      return selectedIds.includes(row.unitId) ? sum + val : sum;
    }, 0);
  }, [items, selectedIds]);

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: drawerWidth } }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Request Payments</Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ px: 2, pb: 1 }}>
        {yearMonth && (
          <Typography variant="body2" color="textSecondary">
            Period:&nbsp;
            <strong>{formattedMonth}</strong>
            {items.length > 0 && (
              <>
                &nbsp;Total:&nbsp;
                <strong>
                  MX$
                  {totalBalance.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </>
            )}
          </Typography>
        )}
      </Box>

      {items.length > 0 && hasSelection && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography variant="body2" color="textSecondary">
            Selected Total:&nbsp;
            <strong>
              MX$
              {selectedTotal.toLocaleString('es-MX', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </Typography>
        </Box>
      )}

      <Box sx={{ px: 2, py: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button size="small" variant="outlined" onClick={handleSelectAll} disabled={items.length === 0}>
          Select all
        </Button>
        <Button size="small" variant="text" onClick={handleClearSelection} disabled={!hasSelection}>
          Clear
        </Button>
      </Box>
      <Box sx={{ borderBottom: (theme) => `1px solid ${theme.palette.divider}`, mx: 2, mb: 1 }} />

      <Box sx={{ px: 0, py: 1, flex: 1, overflowY: 'auto' }}>
        {loading && (
          <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!loading && error && (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          </Box>
        )}

        {!loading && !error && items.length === 0 && (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="textSecondary">
              No units are eligible for payment in this period.
            </Typography>
          </Box>
        )}

        {!loading && !error && items.length > 0 && (
          <List dense disablePadding>
            {items.map((row) => {
              const unitId = row.unitId;
              const checked = selectedIds.includes(unitId);
              const primary = row.unitName || `Unit #${unitId}`;
              const amount = row.closingBalance ?? 0;

              let secondary = '';

              if (typeof amount === 'number') {
                secondary = `Balance: MX$${amount.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`;
              }

              return (
                <ListItem key={unitId} dense sx={{ pl: 2, pr: 2, py: 0.25 }}>
                  <Checkbox
                    edge="start"
                    checked={checked}
                    onChange={() => handleToggle(unitId)}
                    tabIndex={-1}
                    disableRipple
                    sx={{ mr: 1 }}
                  />
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                    }}
                  >
                    <Typography variant="body2" fontWeight="bold">
                      {primary}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Balance: $
                      {amount.toLocaleString('es-MX', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Typography>
                  </Box>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>

      <Box sx={{ px: 2, py: 2, borderTop: (theme) => `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleGeneratePdfClick}
            disabled={!hasSelection || loading || pdfBusy}
          >
            {pdfBusy ? 'Generating…' : 'Generate PDF'}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
};

export default UnitReportPayRequestDrawer;
