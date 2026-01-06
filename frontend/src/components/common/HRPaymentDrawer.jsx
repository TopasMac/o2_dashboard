import React, { useEffect, useState } from 'react';
import { Drawer, Box, Stack, Typography, Button, Divider, FormControl, InputLabel, Select, MenuItem, FormHelperText, Alert, CircularProgress, Checkbox, TextField } from '@mui/material';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import api from '../../api';

/**
 * HRPaymentDrawer (Step 1 – Scaffold)
 * Props:
 *  - open: boolean (controls drawer visibility)
 *  - onClose: function () => void
 *  - onExport: function ({ division, employees, selectedAmounts }) => void
 *
 * Internal state (initialized only):
 *  - division: string
 *  - employees: array
 *  - selectedAmounts: { [employeeId: string]: number }
 */
const HRPaymentDrawer = ({ open = false, onClose, onExport }) => {
  const [division, setDivision] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedAmounts, setSelectedAmounts] = useState({});

  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeesError, setEmployeesError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const loadEmployees = async (div) => {
    if (!div) return;
    setLoadingEmployees(true);
    setEmployeesError(null);
    try {
      const res = await api.get('/api/employees/options', {
        params: { division: div, include: 'bank', status: 'Active' },
      });
      const list = Array.isArray(res.data) ? res.data : (res.data?.rows || []);
      const mapped = list.map((it) => ({
        id: it.value ?? it.id,
        shortName: it.label ?? it.shortName ?? it.name ?? '',
        code: it.code ?? '',
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
    if (division) {
      loadEmployees(division);
    } else {
      setEmployees([]);
    }
  }, [division]);

  const isSelected = (id) => Object.prototype.hasOwnProperty.call(selectedAmounts, String(id)) || Object.prototype.hasOwnProperty.call(selectedAmounts, id);

  const handleToggle = (id, checked) => {
    setSelectedAmounts((prev) => {
      const next = { ...prev };
      const key = String(id);
      if (checked) {
        if (!Object.prototype.hasOwnProperty.call(next, key)) next[key] = '';
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const handleAmountChange = (id, value) => {
    setSelectedAmounts((prev) => ({ ...prev, [String(id)]: value }));
  };

  const validSelectionsCount = Object.values(selectedAmounts || {}).filter(
    (v) => v !== null && v !== undefined && String(v).trim() !== '' && !isNaN(Number(v)) && Number(v) > 0
  ).length;

  // Helper to reset state and close
  const resetState = () => {
    setDivision('');
    setEmployees([]);
    setSelectedAmounts({});
    setEmployeesError(null);
  };

  const handleClose = () => {
    resetState();
    if (typeof onClose === 'function') onClose();
  };

  const handleExport = async () => {
    try {
      const entries = Object.entries(selectedAmounts || {}).filter(
        ([, v]) => v !== null && v !== undefined && String(v).trim() !== '' && !isNaN(Number(v)) && Number(v) > 0
      );

      if (!division) {
        alert('Please select a division first.');
        return;
      }
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
              disabled={exporting || !division || validSelectionsCount === 0}
            >
              {exporting ? 'Exporting…' : 'Export PDF'}
            </Button>
          </Stack>
        </Box>
        <Divider />

        {/* Body */}
        <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
          <Stack spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="hr-div-label">Division</InputLabel>
              <Select
                labelId="hr-div-label"
                label="Division"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
              >
                <MenuItem value="Owners2">Owners2</MenuItem>
                <MenuItem value="Housekeepers">Housekeepers</MenuItem>
              </Select>
              <FormHelperText>Select a division to load active employees with bank data</FormHelperText>
            </FormControl>

            {division && (
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
                  <Typography variant="body2" color="text.secondary">
                    Loaded {employees.length} employee{employees.length === 1 ? '' : 's'} for {division}.
                  </Typography>
                )}
                {!loadingEmployees && !employeesError && employees.length > 0 && (
                  <Stack spacing={1.5} sx={{ mt: 1 }}>
                    {employees.map((emp) => {
                      const checked = isSelected(emp.id);
                      return (
                        <Box key={emp.id} sx={{ border: '1px solid #e0e0e0', borderRadius: 1, p: 1.5 }}>
                          <Stack direction="row" alignItems="center" spacing={1.5}>
                            <Checkbox
                              checked={checked}
                              onChange={(e) => handleToggle(emp.id, e.target.checked)}
                              inputProps={{ 'aria-label': `select ${emp.shortName}` }}
                            />
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                                {emp.shortName || emp.code || emp.id}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Code: {emp.code || '—'} · Bank: {emp.bankName || '—'} · Account: {emp.bankAccount || '—'}
                              </Typography>
                            </Box>
                            {checked && (
                              <TextField
                                size="small"
                                type="number"
                                inputProps={{ min: 0, step: '0.01' }}
                                placeholder="Amount"
                                value={selectedAmounts[String(emp.id)] ?? ''}
                                onChange={(e) => handleAmountChange(emp.id, e.target.value)}
                                sx={{ width: 140 }}
                              />
                            )}
                          </Stack>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            )}
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