import React, { useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
} from '@mui/material';

// NOTE:
// This modal is intentionally PRESENTATIONAL ONLY.
// ❌ Do NOT add data fetching here (no api.get / fetch / authFetchJson / useEffect).
// Data must be loaded by the parent page and passed via props.

/**
 * Modal to start a new Unit Purchase List.
 *
 * Props:
 * - open: boolean
 * - units: array of units (at least: { id, name } OR { unit_id, name } OR { unitId, name })
 * - value: selected unit id (string/number)
 * - onChange: (nextValue) => void
 * - onCancel: () => void
 * - onConfirm: () => void
 * - loading: boolean (optional)
 */
export default function UnitPurchaseListNewListModal({
  open,
  units = [],
  value,
  onChange,
  onCancel,
  onConfirm,
  loading = false,
}) {
  const options = useMemo(() => {
    return (Array.isArray(units) ? units : [])
      .map((u) => {
        const id = u?.id ?? u?.unit_id ?? u?.unitId ?? '';
        const label = u?.name ?? u?.label ?? u?.unit_name ?? String(id || '');
        const meta = {
          type: u?.type ?? '',
          pax: u?.pax ?? null,
          baths: u?.baths ?? null,
          beds: u?.beds ?? null,
        };
        return {
          id: id === null || id === undefined ? '' : String(id),
          label,
          meta,
          raw: u,
        };
      })
      .filter((o) => o.id !== '' && o.label);
  }, [units]);

  const current = value === null || value === undefined ? '' : String(value);
  const selected = options.find((o) => o.id === current) || null;
  const detailsLine = useMemo(() => {
    if (!selected) return '';
    const parts = [];
    if (selected.meta?.type) parts.push(selected.meta.type);
    if (selected.meta?.pax !== null && selected.meta?.pax !== undefined && selected.meta?.pax !== '') {
      parts.push(`Pax ${selected.meta.pax}`);
    }
    if (selected.meta?.baths !== null && selected.meta?.baths !== undefined && selected.meta?.baths !== '') {
      parts.push(`${selected.meta.baths} bath${Number(selected.meta.baths) === 1 ? '' : 's'}`);
    }
    if (selected.meta?.beds !== null && selected.meta?.beds !== undefined && selected.meta?.beds !== '') {
      parts.push(`${selected.meta.beds} bed${Number(selected.meta.beds) === 1 ? '' : 's'}`);
    }
    return parts.join(' • ');
  }, [selected]);

  const metaFor = (opt) => {
    if (!opt) return '';
    const parts = [];
    if (opt.meta?.type) parts.push(opt.meta.type);
    if (opt.meta?.pax !== null && opt.meta?.pax !== undefined && opt.meta?.pax !== '') parts.push(`Pax ${opt.meta.pax}`);
    if (opt.meta?.baths !== null && opt.meta?.baths !== undefined && opt.meta?.baths !== '') parts.push(`${opt.meta.baths} bath${Number(opt.meta.baths) === 1 ? '' : 's'}`);
    if (opt.meta?.beds !== null && opt.meta?.beds !== undefined && opt.meta?.beds !== '') parts.push(`${opt.meta.beds} bed${Number(opt.meta.beds) === 1 ? '' : 's'}`);
    return parts.join(' • ');
  };

  const canConfirm = !!current && !loading;

  return (
    <Dialog
      open={!!open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pb: 1 }}>New Purchase List</DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          Select a unit to create a new draft purchase list.
        </Typography>

        <Box sx={{ mt: 0.5 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="o2-new-purchase-list-unit-label">Unit</InputLabel>
            <Select
              labelId="o2-new-purchase-list-unit-label"
              label="Unit"
              value={current}
              onChange={(e) => onChange?.(e.target.value)}
              disabled={loading}
            >
              {options.map((opt) => {
                const meta = metaFor(opt);
                return (
                  <MenuItem key={opt.id} value={opt.id} dense>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        gap: 1,
                      }}
                    >
                      <Typography variant="body2" noWrap sx={{ flex: '1 1 auto' }}>
                        {opt.label}
                      </Typography>
                      {meta ? (
                        <Typography
                          variant="caption"
                          noWrap
                          sx={{ color: 'text.secondary', flex: '0 0 auto' }}
                        >
                          {meta}
                        </Typography>
                      ) : null}
                    </Box>
                  </MenuItem>
                );
              })}
            </Select>
            {detailsLine ? (
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                {detailsLine}
              </Typography>
            ) : null}
          </FormControl>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onConfirm} disabled={!canConfirm}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}