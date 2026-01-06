import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Stack } from '@mui/material';
import { useForm } from 'react-hook-form';
import RHFForm, { RHFTextField, RHFSelect, RHFDatePicker } from './rhf/RHFForm';
import { widthMap } from '../forms/rhf/widthMap';
import api from '../../api';

/**
 * HRTransactionsNewFormRHF
 * Fields:
 *  - (hidden) employeeId
 *  - Division (Owners2, Housekeepers)
 *  - Name (employee shortName; options filtered by Division)
 *  - Area (auto from employee.area; disabled)
 *  - City (auto from employee.city; disabled)
 *  - Cost Centre (auto from division/city; disabled)
 *  - Type (Salary, Advance, Bonus, Deduction) default Salary
 *  - Start (period_start) / End (period_end) with End default = Start + 7 days
 *  - Amount
 *  - Notes
 */
const HRTransactionsNewFormRHF = ({ onSubmit, onChange, disabled }) => {
  // Helpers
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const toYmd = (d) => {
    // Accept 'YYYY-MM-DD' and Date
    if (!d) return '';
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return '';
  };
  const addDays = (ymd, days = 7) => {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
    const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCDate(base.getUTCDate() + days);
    const yy = base.getUTCFullYear();
    const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(base.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  const computeCostCentre = (division, city) => {
    const d = norm(division);
    const c = norm(city);
    if (d === 'housekeepers') {
      if (c === 'playa del carmen' || c === 'playa' ) return 'HK_Playa';
      if (c === 'tulum') return 'HK_Tulum';
      return 'HK_General';
    }
    // Owners2 (default)
    if (c === 'playa del carmen' || c === 'playa') return 'O2_Playa';
    if (c === 'tulum') return 'O2_Tulum';
    return 'O2_General';
  };

  // RHF wiring
  const initialValues = useMemo(() => ({
    employeeId: '',
    division: '',
    name: '', // holds employeeId as value once selected
    area: '',
    city: '',
    costCentre: '',
    type: 'salary',
    periodStart: '',
    periodEnd: '',
    amount: '',
    notes: '',
  }), []);

  const methods = useForm({ defaultValues: initialValues });
  const { watch, setValue, reset, handleSubmit } = methods;

  useEffect(() => {
    reset(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Division & Name options
  const division = watch('division');
  const selectedName = watch('name'); // will be employeeId
  const [empOptions, setEmpOptions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      try {
        if (!division) { setEmpOptions([]); return; }
        const { data } = await api.get('/api/employees/options', { params: { division, limit: 200 } });
        if (cancelled) return;
        const opts = Array.isArray(data) ? data.map((r) => ({
          label: r.label || r.code || String(r.value),
          value: String(r.value), // use id as value
          city: r.city || null,
          division: r.division || null,
        })) : [];
        setEmpOptions(opts);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load employees for division', division, e);
        setEmpOptions([]);
      }
    }
    loadEmployees();
    return () => { cancelled = true; };
  }, [division]);

  // When Name (employeeId) changes, fetch the employee details to populate area/city
  useEffect(() => {
    let cancelled = false;
    async function loadEmployeeDetail() {
      try {
        if (!selectedName) return;
        const id = String(selectedName);
        const { data } = await api.get(`/api/employees/${id}`);
        if (cancelled) return;
        const area = data?.area || '';
        const city = data?.city || '';
        setValue('employeeId', id, { shouldDirty: true });
        setValue('area', area, { shouldValidate: true, shouldDirty: true });
        setValue('city', city, { shouldValidate: true, shouldDirty: true });
        // Derive cost centre if missing
        const cc = computeCostCentre(division, city);
        setValue('costCentre', cc, { shouldValidate: true, shouldDirty: true });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load employee detail', e);
      }
    }
    loadEmployeeDetail();
    return () => { cancelled = true; };
  }, [selectedName, division, setValue]);

  // Auto set End = Start + 7 days (default), but let user override later
  const startVal = watch('periodStart');
  const endVal = watch('periodEnd');
  useEffect(() => {
    if (!startVal) return;
    if (!endVal) {
      const next = addDays(startVal, 7);
      setValue('periodEnd', next, { shouldDirty: true });
    }
  }, [startVal, endVal, setValue]);

  // Local submit to normalize payload
  const submitHandler = handleSubmit(async (values) => {
    const payload = {
      employeeId: values.employeeId || values.name || '',
      division: values.division || null,
      type: values.type || 'salary',
      periodStart: toYmd(values.periodStart) || null,
      periodEnd: toYmd(values.periodEnd) || null,
      amount: values.amount !== '' ? String(values.amount) : '0.00',
      notes: values.notes || null,
      city: values.city || null,
      costCentre: values.costCentre || null,
    };
    if (onSubmit) await onSubmit(payload);
  });

  return (
    <RHFForm
      methods={methods}
      formId="hr-ledger-new-form"
      onSubmit={submitHandler}
      onChange={onChange}
      disabled={disabled}
    >
      {/* Hidden employeeId (kept in sync when Name changes) */}
      <input type="hidden" name="employeeId" value={watch('employeeId') || ''} />

      <RHFSelect
        name="division"
        label="Division"
        options={[
          { label: 'Owners2', value: 'Owners2' },
          { label: 'Housekeepers', value: 'Housekeepers' },
        ]}
        width="full"
        sx={{ width: widthMap.full }}
        required
      />

      <Stack direction="row" spacing={2} sx={{ width: '100%', flexWrap: 'wrap' }}>
        <RHFSelect
          name="name"
          label="Name"
          options={empOptions}
          getOptionLabel={(o) => o?.label ?? ''}
          getOptionValue={(o) => o?.value ?? ''}
          placeholder={division ? 'Select employee' : 'Select division first'}
          width="half"
          sx={{ width: widthMap.half }}
          required
        />
        <RHFTextField name="costCentre" label="Cost Centre" width="half" sx={{ width: widthMap.half }} disabled />
      </Stack>

      <Stack direction="row" spacing={2} sx={{ width: '100%', flexWrap: 'wrap' }}>
        <RHFTextField name="area" label="Area" width="half" sx={{ width: widthMap.half }} disabled />
        <RHFTextField name="city" label="City" width="half" sx={{ width: widthMap.half }} disabled />
      </Stack>

      <RHFSelect
        name="type"
        label="Type"
        options={[
          { label: 'Salary', value: 'salary' },
          { label: 'Advance', value: 'advance' },
          { label: 'Bonus', value: 'bonus' },
          { label: 'Deduction', value: 'deduction' },
        ]}
        width="half"
        sx={{ width: widthMap.half }}
        required
      />

      <Stack direction="row" spacing={2} sx={{ width: '100%', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <RHFDatePicker
          name="periodStart"
          label="Start"
          width="half"
          sx={{
            width: widthMap.half,
            '& .MuiInputBase-root': { mt: 0 },
            '& .MuiFormHelperText-root': { mt: 0 },
          }}
        />
        <RHFDatePicker
          name="periodEnd"
          label="End"
          width="half"
          sx={{
            width: widthMap.half,
            '& .MuiInputBase-root': { mt: 0 },
            '& .MuiFormHelperText-root': { mt: 0 },
          }}
        />
      </Stack>

      <RHFTextField name="amount" label="Amount" type="number" step="0.01" width="full" sx={{ width: widthMap.full }} required />
      <RHFTextField name="notes" label="Notes" multiline minRows={3} width="full" sx={{ width: widthMap.full }} />
    </RHFForm>
  );
};

HRTransactionsNewFormRHF.propTypes = {
  onSubmit: PropTypes.func,
  onChange: PropTypes.func,
  disabled: PropTypes.bool,
};

export default HRTransactionsNewFormRHF;