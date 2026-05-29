import React from 'react';
import {
  Autocomplete,
  Box,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';

const widthMap = {
  full: { width: '300px' },
  half: { width: '142px' },
  twoThirds: { width: '178px' },
  oneThird: { width: '105px' },
};

const normalizeItemType = (value) => {
  const v = String(value || '').toLowerCase();
  if (v === 'kg' || v === 'kilo') return 'kg';
  return v;
};

const normalizeItemTypeForForm = (value) => {
  const v = String(value || '').toLowerCase();
  if (v === 'kg' || v === 'kilo') return 'KG';
  if (v === 'pillow' || v === 'almohada') return 'PILLOW';
  if (v === 'cushion' || v === 'cojin' || v === 'cojín') return 'CUSHION';
  return value || 'KG';
};

const mapInitialValues = (record = {}) => ({
  laundryDate: record.laundryDate || '',
  unitId: record.unitId || '',
  rateId: record.rateId || '',
  itemType: normalizeItemTypeForForm(record.itemType || 'KG'),
  quantity: record.quantity || '',
  rateSnapshot: record.rateSnapshot || '',
  expectedAmount: record.expectedAmount || '',
  chargedAmount: record.chargedAmount || record.expectedAmount || '',
  providerId: record.providerId || '',
  createdBy: record.createdBy || '',
  updatedBy: record.updatedBy || '',
  notes: record.notes || '',
});

export default function HKLaundryRecordEditFormRHF({
  record = {},
  units = [],
  rates = [],
  onSubmit,
  onSave,
  formId = 'hk-laundry-record-edit-form',
}) {
  const [form, setForm] = React.useState(() => mapInitialValues(record));
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setForm(mapInitialValues(record));
    setError('');
  }, [record]);

  const playaActiveUnits = React.useMemo(() => {
    return units.filter((unit) => {
      const city = String(unit.city || unit.cityName || unit.location || '').toLowerCase();
      const status = String(unit.status || '').toLowerCase();

      const isPlaya = city === 'playa del carmen' || city === 'playa';
      const isActive = !status || status === 'active';

      return isPlaya && isActive;
    });
  }, [units]);

  const selectedUnit = React.useMemo(() => {
    return playaActiveUnits.find((unit) => String(unit.id) === String(form.unitId)) || null;
  }, [playaActiveUnits, form.unitId]);

  const getUnitLabel = (unit) => {
    if (!unit) return '';
    return unit.unitName || unit.name || unit.label || unit.unit_id || `Unit #${unit.id}`;
  };

  const selectedTypeRate = React.useMemo(() => {
    const selectedType = normalizeItemType(form.itemType);

    return rates.find((rate) => {
      const rateType = normalizeItemType(rate.itemType);
      const city = String(rate.city || '').toLowerCase();
      const isPlaya = city === 'playa del carmen' || city === 'playa';
      const isActive = rate.isActive !== false;

      return isActive && isPlaya && rateType === selectedType;
    }) || null;
  }, [rates, form.itemType]);

  const recalculateAmounts = React.useCallback((next) => {
    const fallbackRate = selectedTypeRate?.unitPrice != null ? String(selectedTypeRate.unitPrice) : '';
    const rateValue = next.rateSnapshot || fallbackRate;
    const amount = Number(next.quantity);
    const rate = Number(rateValue);

    if (next.rateSnapshot === '' && fallbackRate !== '') {
      next.rateSnapshot = fallbackRate;
    }

    if (!Number.isNaN(amount) && !Number.isNaN(rate) && amount > 0 && rate >= 0) {
      const expected = (amount * rate).toFixed(2);
      next.expectedAmount = expected;
      if (!next.chargedAmount || String(next.chargedAmount) === String(form.expectedAmount)) {
        next.chargedAmount = expected;
      }
    } else {
      next.expectedAmount = '';
      if (!next.chargedAmount) next.chargedAmount = '';
    }

    return next;
  }, [selectedTypeRate, form.expectedAmount]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;

    setForm((prev) => {
      const next = { ...prev, [field]: value };

      if (field === 'itemType') {
        const selectedType = normalizeItemType(value);
        const matchingRate = rates.find((rate) => {
          const rateType = normalizeItemType(rate.itemType);
          const city = String(rate.city || '').toLowerCase();
          const isPlaya = city === 'playa del carmen' || city === 'playa';
          const isActive = rate.isActive !== false;

          return isActive && isPlaya && rateType === selectedType;
        });

        next.rateId = matchingRate?.id || '';
        next.rateSnapshot = matchingRate?.unitPrice != null ? String(matchingRate.unitPrice) : '';
        next.providerId = matchingRate?.providerId || '';
        return recalculateAmounts(next);
      }

      if (field === 'quantity' || field === 'rateSnapshot') {
        return recalculateAmounts(next);
      }

      return next;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    if (!form.laundryDate) {
      setError('Please select a laundry date.');
      return;
    }

    if (!form.unitId) {
      setError('Please select a unit.');
      return;
    }

    if (!form.quantity || Number(form.quantity) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    const payload = {
      laundryDate: form.laundryDate,
      unitId: Number(form.unitId),
      rateId: selectedTypeRate?.id ? Number(selectedTypeRate.id) : (form.rateId ? Number(form.rateId) : null),
      quantity: form.quantity,
      rateSnapshot: form.rateSnapshot || null,
      expectedAmount: form.expectedAmount || null,
      chargedAmount: form.chargedAmount || form.expectedAmount || null,
      providerId: form.providerId ? Number(form.providerId) : null,
      updatedBy: form.updatedBy || null,
      notes: form.notes || null,
    };

    if (onSubmit) {
      onSubmit(payload);
      return;
    }

    if (onSave) {
      onSave(payload);
    }
  };

  return (
    <Box
      id={formId}
      component="form"
      onSubmit={handleSubmit}
      sx={{ mt: 2 }}
    >
      <Stack spacing={2}>
        <TextField
          label="Laundry Date"
          type="date"
          value={form.laundryDate}
          onChange={handleChange('laundryDate')}
          InputLabelProps={{ shrink: true }}
          fullWidth
          required
        />

        <Autocomplete
          options={playaActiveUnits}
          value={selectedUnit}
          onChange={(_, selected) => {
            setForm((prev) => ({
              ...prev,
              unitId: selected?.id || '',
            }));
          }}
          getOptionLabel={getUnitLabel}
          isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Unit"
              fullWidth
              required
            />
          )}
        />

        <Stack direction="row" spacing={2}>
          <TextField
            select
            label="Type"
            value={form.itemType}
            onChange={handleChange('itemType')}
            sx={widthMap.half}
            required
          >
            <MenuItem value="KG">KG</MenuItem>
            <MenuItem value="PILLOW">Almohada</MenuItem>
            <MenuItem value="CUSHION">Cojín</MenuItem>
          </TextField>

          <TextField
            label="Rate"
            value={selectedTypeRate?.unitPrice != null ? `${selectedTypeRate.unitPrice} MXN` : ''}
            sx={widthMap.half}
            InputProps={{ readOnly: true }}
          />
        </Stack>

        <Stack direction="row" spacing={2}>
          <TextField
            label="Amount"
            type="number"
            value={form.quantity}
            onChange={handleChange('quantity')}
            inputProps={{ step: '0.01', min: '0' }}
            sx={widthMap.half}
            required
          />

          <TextField
            label="Expected"
            value={form.expectedAmount ? `${form.expectedAmount} MXN` : ''}
            sx={widthMap.half}
            InputProps={{ readOnly: true }}
          />
        </Stack>

        <TextField
          label="Charged"
          type="number"
          value={form.chargedAmount}
          onChange={handleChange('chargedAmount')}
          inputProps={{ step: '0.01', min: '0' }}
          fullWidth
        />

        <TextField
          label="Updated by"
          value={form.updatedBy}
          onChange={handleChange('updatedBy')}
          fullWidth
        />

        <TextField
          label="Notes"
          value={form.notes}
          onChange={handleChange('notes')}
          multiline
          minRows={3}
          fullWidth
        />

        {error && (
          <Box sx={{ color: 'error.main', fontSize: 14 }}>
            {error}
          </Box>
        )}
      </Stack>
    </Box>
  );
}