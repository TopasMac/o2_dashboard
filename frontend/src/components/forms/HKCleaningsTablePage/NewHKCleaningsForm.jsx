import React, { useEffect, useMemo, useState } from 'react';
import FormLayoutInline from '../../layouts/FormLayoutInline';
import { TextField, Autocomplete, Stack, Button, MenuItem } from '@mui/material';
import api from '../../../api';

/**
 * NewHKCleaningsForm
 * Props:
 *  - onSuccess?: (createdRow) => void
 *  - onCancel?: () => void
 */
export default function NewHKCleaningsForm({ onSuccess, onCancel }) {
  const [units, setUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const [form, setForm] = useState({
    reservation_code: '',
    checkout_date: '', // yyyy-mm-dd
    status: '', // pending|done|cancelled (autofilled on date change if empty)
    unit_id: null,
    unit_name: '',
    city: '',
    cleaning_type: 'checkout', // hidden, fixed
    cleaning_cost: '',
    o2_collected_fee: '',
    notes: '',
  });

  const [statusTouched, setStatusTouched] = useState(false);

  // --- Fetch units (id, name, city, fees) ---
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingUnits(true);
      try {
        // Pull units directly from the hk-cleanings listing payload
        const res = await api.get('/api/hk-cleanings', { params: { page: 1, pageSize: 1, status: 'any' } });
        const d = res?.data;
        console.debug('[HKCleaningsForm] baseURL=', api?.defaults?.baseURL);
        console.debug('[HKCleaningsForm] /api/hk-cleanings raw:', d);
        const fromUnits = Array.isArray(d?.units) ? d.units : (Array.isArray(d?.data?.units) ? d.data.units : []);
        const normalized = (fromUnits || []).map(u => ({
          id: u.id,
          unit_name: u.unit_name || u.unitName || u.name || '',
          label: (u.unit_name || u.unitName || u.name || '').toString(),
          city: u.city || u.cityName || '',
          cleaning_fee: u.cleaning_fee ?? u.cleaningFee ?? null,
        })).filter(u => !!u.id);
        if (alive) {
          console.debug('[HKCleaningsForm] units loaded:', normalized.length);
          setUnits(normalized);
        }
      } catch (e) {
        console.error(e);
        if (alive) setUnits([]);
      } finally {
        if (alive) setLoadingUnits(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Helpers to derive default fees from unit record
  const deriveDefaultCollected = (u) => {
    if (!u) return '';
    // Common field names seen in this codebase
    return (
      u.cleaning_fee ??
      u.cleaningFee ??
      u.o2_collected_fee ??
      ''
    );
  };
  const deriveDefaultCleaningCost = (u) => {
    if (!u) return '';
    // Only prefill from an explicit HK payout rate if present.
    // Do NOT fall back to the unit cleaning_fee — that represents guest fee, not payout.
    return (
      u.hk_payout_amount ??
      u.hkPayoutAmount ??
      ''
    );
  };

  // When unit changes, auto-fill city and fees
  const onUnitChange = (_e, unitOption) => {
    const u = unitOption || null;
    setForm((prev) => ({
      ...prev,
      unit_id: u ? u.id : null,
      unit_name: u ? (u.unit_name || u.name) : '',
      city: u ? (u.city || '') : '',
      // keep editable but prefill if we can
      o2_collected_fee: u ? String(deriveDefaultCollected(u) ?? '') : '',
      cleaning_cost: u ? String(deriveDefaultCleaningCost(u) ?? '') : '',
    }));
  };

  const selectedUnit = useMemo(() => units.find(u => u.id === form.unit_id) || null, [units, form.unit_id]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleDateChange = (e) => {
    const val = e.target.value; // yyyy-mm-dd
    setForm((prev) => {
      let next = { ...prev, checkout_date: val };
      if (!statusTouched && val) {
        const today = new Date();
        const todayYmd = today.toISOString().slice(0,10);
        if (val > todayYmd) {
          next.status = 'pending';
        } else {
          next.status = 'done';
        }
      }
      return next;
    });
  };

  const canSave = Boolean(form.checkout_date && form.unit_id);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSave || saving) return;
    setSaving(true);
    setErr(null);

    try {
      const payload = {
        items: [
          {
            unitId: form.unit_id,
            city: form.city || (selectedUnit?.city ?? ''),
            checkoutDate: form.checkout_date,
            cleaningType: 'checkout',
            reservationCode: form.reservation_code || null,
            o2CollectedFee: form.o2_collected_fee !== '' ? Number(form.o2_collected_fee) : null,
            // status: done because this is a manual add via form
            status: form.status || 'done',
            // cleaning_cost will be filled by the backend resolver if null; send if user edited
            // Note: API accepts it implicitly via manager (we also resolve backend-side)
            // Include bookingId only if you extend the form later
            notes: form.notes || null,
          },
        ],
      };

      const res = await api.post('/api/hk-cleanings/bulk', payload);
      const json = res?.data ?? res;
      if (json?.ok === false) {
        throw new Error(json?.detail || json?.message || 'Failed to create cleaning');
      }
      if (onSuccess) onSuccess(json);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormLayoutInline title="Add Cleaning" onSubmit={handleSubmit}>
      <Stack direction="column" spacing={3} sx={{ mb: 1 }}>
        <TextField
          label="Reservation Code"
          size="small"
          value={form.reservation_code}
          onChange={handleChange('reservation_code')}
        />

        <TextField
          label="Date"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={form.checkout_date}
          onChange={handleDateChange}
          placeholder="YYYY-MM-DD"
          required
        />

        <TextField
          label="Status"
          select
          size="small"
          value={form.status}
          onChange={(e) => { setStatusTouched(true); setForm((p) => ({ ...p, status: e.target.value })); }}
        >
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="done">Done</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </TextField>

        <Autocomplete
          options={units}
          loading={loadingUnits}
          getOptionLabel={(o) => (o?.label ?? o?.unit_name ?? o?.name ?? '')}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          value={selectedUnit}
          onChange={onUnitChange}
          sx={{ minWidth: 240 }}
          loadingText="Loading units…"
          noOptionsText={loadingUnits ? 'Loading…' : 'No units found'}
          renderInput={(params) => (
            <TextField {...params} label="Unit" size="small" />
          )}
        />

        <TextField
          label="City"
          size="small"
          value={form.city}
          onChange={handleChange('city')}
          disabled
        />

        <TextField
          label="Cleaning Cost"
          size="small"
          type="number"
          inputProps={{ step: '0.01' }}
          value={form.cleaning_cost}
          onChange={handleChange('cleaning_cost')}
        />

        <TextField
          label="O2 Collected"
          size="small"
          type="number"
          inputProps={{ step: '0.01' }}
          value={form.o2_collected_fee}
          onChange={handleChange('o2_collected_fee')}
        />

        <TextField
          label="Notes"
          size="small"
          value={form.notes}
          onChange={handleChange('notes')}
          sx={{ minWidth: 260 }}
        />
      </Stack>

      {err && (
        <div style={{ color: 'crimson', fontSize: 13, marginBottom: 8 }}>{err}</div>
      )}

      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          color="success"
          disabled={!canSave || saving}
          onClick={handleSubmit}
          sx={{ fontWeight: 700 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="outlined"
          color="error"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </Stack>
    </FormLayoutInline>
  );
}