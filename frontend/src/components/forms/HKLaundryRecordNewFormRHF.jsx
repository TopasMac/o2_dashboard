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

export default function HKLaundryRecordNewFormRHF({
  units = [],
  rates = [],
  onSubmit,
  onSave,
  formId = 'hk-laundry-record-new-form',
  initialValues = {},
}) {
  const [form, setForm] = React.useState({
    laundryDate: initialValues.laundryDate || '',
    unitId: initialValues.unitId || '',
    rateId: initialValues.rateId || '',
    itemType: initialValues.itemType || 'KG',
    quantity: initialValues.quantity || initialValues.weightKg || '',
    rateSnapshot: initialValues.rateSnapshot || initialValues.pricePerKgSnapshot || '',
    expectedAmount: initialValues.expectedAmount || initialValues.calculatedAmount || '',
    chargedAmount: initialValues.chargedAmount || initialValues.calculatedAmount || '',
    providerId: initialValues.providerId || '',
    createdBy: initialValues.createdBy || '',
    notes: initialValues.notes || '',
  });
  const [error, setError] = React.useState('');

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

  const normalizeItemType = (value) => {
    const v = String(value || '').toLowerCase();
    if (v === 'kg' || v === 'kilo') return 'kg';
    return v;
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

        if (next.quantity !== '' && next.rateSnapshot !== '') {
          const expected = (
            Number(next.quantity || 0) * Number(next.rateSnapshot || 0)
          ).toFixed(2);
          next.expectedAmount = expected;
          next.chargedAmount = expected;
        } else {
          next.expectedAmount = '';
          next.chargedAmount = '';
        }
      }

      if (field === 'rateId') {
        const selectedRate = rates.find((r) => String(r.id) === String(value));
        if (selectedRate?.unitPrice != null) {
          next.rateSnapshot = String(selectedRate.unitPrice);
          next.providerId = selectedRate.providerId || '';
          if (next.quantity !== '') {
            const expected = (
              Number(next.quantity || 0) * Number(selectedRate.unitPrice || 0)
            ).toFixed(2);
            next.expectedAmount = expected;
            next.chargedAmount = expected;
          }
        }
      }

      if (field === 'quantity' || field === 'rateSnapshot') {
        const amount = Number(field === 'quantity' ? value : next.quantity);
        const fallbackRate = selectedTypeRate?.unitPrice != null ? String(selectedTypeRate.unitPrice) : '';
        const rateValue = field === 'rateSnapshot' ? value : (next.rateSnapshot || fallbackRate);
        const rate = Number(rateValue);

        if (next.rateSnapshot === '' && fallbackRate !== '') {
          next.rateSnapshot = fallbackRate;
        }

        if (!Number.isNaN(amount) && !Number.isNaN(rate) && amount > 0 && rate >= 0) {
          const expected = (amount * rate).toFixed(2);
          next.expectedAmount = expected;
          next.chargedAmount = expected;
        } else {
          next.expectedAmount = '';
          next.chargedAmount = '';
        }
      }

      return next;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

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
      createdBy: form.createdBy || null,
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
            <MenuItem value="PILLOW">Pillow</MenuItem>
            <MenuItem value="BLANKET">Blanket</MenuItem>
            <MenuItem value="DUVET">Duvet</MenuItem>
            <MenuItem value="OTHER">Other</MenuItem>
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