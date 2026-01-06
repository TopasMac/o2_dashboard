import React from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import RHFForm, { RHFTextField, RHFSelect, RHFDatePicker, RHFFile, RHFCheckbox } from './rhf/RHFForm';
import { Box } from '@mui/material';
import api from '../../api';
import { widthMap } from './rhf/widthMap';

const mapInitial = (iv = {}) => {
  const unitId = iv.unitId ?? iv.unit?.id ?? '';
  const categoryId = iv.categoryId ?? iv.category?.id ?? '';
  // API returns notes; UI uses comments
  const comments = iv.comments ?? iv.notes ?? '';
  return {
    id: iv.id,
    transactionCode: iv.transactionCode,
    date: iv.date || new Date().toISOString().slice(0,10),
    unitId,
    categoryId,
    type: iv.type ?? iv.category?.type ?? 'Gasto',
    description: iv.description ?? '',
    paid: iv.paid ?? '',
    charged: iv.charged ?? '',
    comments,
    doc1: iv.doc1 ?? null,
    doc2: iv.doc2 ?? null,
    mirrorToO2: iv.mirrorToO2 ?? false,
    city: iv.city ?? iv.unit?.city ?? '',
    costCentre: iv.costCentre ?? '',
  };
};

/**
 * HKTransactionEditFormRHF
 * -----------------------
 * Housekeeping Transaction EDIT form (RHF version) rendered inside AppDrawer.
 * - Uses RHFForm with a stable formId so AppDrawer footer buttons can submit.
 * - No inline Save/Cancel buttons — rely on AppDrawer footer (showActions, formId).
 * - Inputs sized with widthVariant to avoid horizontal scrolling.
 *
 * Props:
 *  - formId?: string (default: 'hk-tx-form')
 *  - initialValues?: object (defaultValues for RHF)
 *  - onSave?: function(values)
 *  - onClose?: function()
 *  - unitOptions?: array (for Unit select)
 *  - categoryOptions?: array (for Category select)
 *  - typeOptions?: array (for Type select; default ['Ingreso', 'Gasto'])
 */
export default function HKTransactionEditFormRHF({
  formId = 'hk-tx-form',
  initialValues = {},
  onSave,
  onClose,
  unitOptions = null,
  categoryOptions = null,
  typeOptions = ['Ingreso', 'Gasto'],
}) {
  const methods = useForm({
    defaultValues: mapInitial(initialValues),
    mode: 'onChange',
  });
  const { handleSubmit, setValue, watch } = methods;

  const [units, setUnits] = React.useState(unitOptions || []);
  const [categories, setCategories] = React.useState(categoryOptions || []);
  const [cityOptions, setCityOptions] = React.useState(['Playa del Carmen', 'Tulum', 'General']);
  const [costCentreOptions, setCostCentreOptions] = React.useState(['Client', 'Owners2']);
  const [hkEmployeeOptions, setHkEmployeeOptions] = React.useState([]);
  const norm = (s) => (s ?? '').toString().trim().toLowerCase();

  const hkUnitId = React.useMemo(() => {
    const hk = units.find(u => norm(u.unitName) === 'housekeepers');
    return hk?.id ? String(hk.id) : '29';
  }, [units]);

  React.useEffect(() => {
    if (unitOptions && unitOptions.length) {
      const sorted = [...unitOptions].sort((a, b) => {
        const aName = a.unitName?.toLowerCase() || '';
        const bName = b.unitName?.toLowerCase() || '';
        if (aName === 'housekeepers') return -1;
        if (bName === 'housekeepers') return 1;
        return aName.localeCompare(bName);
      });
      setUnits(sorted);
    } else {
      setUnits([]);
    }
  }, [unitOptions]);
  React.useEffect(() => {
    setCategories(categoryOptions || []);
  }, [categoryOptions]);

  const selectedUnitId = watch('unitId');
  React.useEffect(() => {
    if (!selectedUnitId) {
      // No unit chosen yet — generic options
      setCityOptions(['Playa del Carmen', 'Tulum', 'General']);
      return;
    }
    const u = units.find(x => String(x.id) === String(selectedUnitId));
    if (!u) {
      setCityOptions(['Playa del Carmen', 'Tulum', 'General']);
      return;
    }
    if (norm(u.unitName) === 'housekeepers') {
      // Housekeepers: default General, options include General + cities
      setCityOptions(['General', 'Playa del Carmen', 'Tulum']);
      const current = watch('city');
      if (!current || !['General', 'Playa del Carmen', 'Tulum'].includes(current)) {
        setValue('city', 'General', { shouldDirty: true, shouldValidate: true });
      }
    } else {
      // Other units: lock to unit's own city
      const city = u.city || '';
      setCityOptions(city ? [city] : ['Playa del Carmen', 'Tulum', 'General']);
      if (city) {
        setValue('city', city, { shouldDirty: true, shouldValidate: true });
      }
    }
  }, [selectedUnitId, units, setValue, watch]);

  const cityVal = watch('city');
  React.useEffect(() => {
    const u = units.find(x => String(x.id) === String(selectedUnitId));
    const current = watch('costCentre');
    if (u && norm(u.unitName) === 'housekeepers') {
      // Build by city: Playa del Carmen -> Housekeepers_Playa, Tulum -> Housekeepers_Tulum, General/other -> Housekeepers_General
      let cc = 'Housekeepers_General';
      if (norm(cityVal) === 'tulum') cc = 'Housekeepers_Tulum';
      else if (norm(cityVal) === 'playa del carmen' || norm(cityVal) === 'playa') cc = 'Housekeepers_Playa';
      setCostCentreOptions([cc]);
      if (current !== cc) {
        setValue('costCentre', cc, { shouldValidate: true, shouldDirty: true });
      }
    } else {
      // Other units: dropdown Client / Owners2, default Client
      setCostCentreOptions(['Client', 'Owners2']);
      if (!current || !['Client', 'Owners2'].includes(current)) {
        setValue('costCentre', 'Client', { shouldValidate: true, shouldDirty: true });
      }
    }
  }, [selectedUnitId, cityVal, units, setValue, watch]);

  const [categoryType, setCategoryType] = React.useState(null); // 'Gasto' | 'Ingreso' | 'Both' | null

  const settingChargedRef = React.useRef(false);
  const userEditedChargedRef = React.useRef(false);

  const chargedVal = watch('charged');
  React.useEffect(() => {
    if (settingChargedRef.current) {
      // Reset the flag right after our programmatic set
      settingChargedRef.current = false;
      return;
    }
    if (chargedVal !== '' && chargedVal != null) {
      userEditedChargedRef.current = true;
    }
  }, [chargedVal]);

  const strip = (s) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const inMarkupCategories = (name) => {
    const n = strip(name).trim().toLowerCase();
    return ['blancos','decoracion','equipamiento','mantenimiento','menage','otros'].includes(n);
  };

  const catId = watch('categoryId');
  React.useEffect(() => {
    const found = categories.find(c => String(c.id) === String(catId));
    const newType = found?.type || null;
    setCategoryType(newType);
    if (newType === 'Gasto' || newType === 'Ingreso') {
      setValue('type', newType, { shouldValidate: true, shouldDirty: true });
    } else if (newType === 'Both') {
      // default to Gasto if user hasn't chosen
      const current = watch('type');
      if (current !== 'Gasto' && current !== 'Ingreso') {
        setValue('type', 'Gasto', { shouldValidate: true, shouldDirty: true });
      }
    }
  }, [catId, categories, setValue]);       

  const isNomina = React.useMemo(() => {
    const found = categories.find(c => String(c.id) === String(catId));
    return norm(found?.name) === 'nomina';
  }, [catId, categories]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadHKEmployees() {
      try {
        if (!isNomina) { setHkEmployeeOptions([]); return; }
        const { data } = await api.get('/api/employees/options', { params: { division: 'Housekeepers', limit: 200 } });
        if (cancelled) return;
        const opts = Array.isArray(data) ? data.map((r) => ({
          label: r.label || r.code || String(r.value),
          value: String(r.value), // use employee id as value
          city: r.city || null,
        })) : [];
        setHkEmployeeOptions(opts);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load HK employee options', e);
      }
    }
    loadHKEmployees();
    return () => { cancelled = true; };
  }, [isNomina]);

  const descVal = watch('description');
  React.useEffect(() => {
    if (!isNomina) return;
    if (!descVal) return;
    const optByValue = hkEmployeeOptions.find(o => o.value === String(descVal));
    const optByLabel = hkEmployeeOptions.find(o => o.label === String(descVal));
    const opt = optByValue || optByLabel || null;
    if (!opt) return;
    // If current description is label, convert to id so submit sends employeeId
    if (!optByValue && optByLabel) {
      setValue('description', opt.value, { shouldValidate: true, shouldDirty: true });
    }
    // Force Unit = Housekeepers
    setValue('unitId', hkUnitId, { shouldValidate: true, shouldDirty: true });
    // If API provided a city, set it too
    if (opt.city) {
      setValue('city', opt.city, { shouldValidate: true, shouldDirty: true });
    }
  }, [isNomina, descVal, hkEmployeeOptions, hkUnitId, setValue]);

  const paidVal = watch('paid');
  const costCentreVal = watch('costCentre');
  React.useEffect(() => {
    // Guard conditions
    const cat = categories.find(c => String(c.id) === String(catId));
    const shouldCalc = cat && inMarkupCategories(cat.name) && costCentreVal === 'Client';
    const amountNum = paidVal === '' || paidVal == null ? NaN : Number(paidVal);
    if (!shouldCalc || !isFinite(amountNum) || amountNum <= 0) return;
    if (userEditedChargedRef.current) return; // user already typed charged, don't overwrite

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/markup/calc', { params: { amount: amountNum } });
        if (cancelled || !data) return;
        settingChargedRef.current = true;
        // Prefer two decimals if number
        const next = (typeof data.charged === 'number') ? data.charged.toFixed(2) : String(data.charged);
        setValue('charged', next, { shouldValidate: true, shouldDirty: true });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Markup calc failed', e);
      }
    })();

    return () => { cancelled = true; };
  }, [paidVal, costCentreVal, catId, categories, setValue]);

  const onSubmit = (values) => {
    // Derive allocationTarget for Housekeepers (unitId 29); else default to 'Unit'
    let allocationTarget = 'Unit';
    try {
      if (String(values.unitId) === '29') {
        const c = norm(values.city);
        if (c === 'tulum') allocationTarget = 'Housekeepers_Tulum';
        else if (c === 'playa del carmen' || c === 'playa') allocationTarget = 'Housekeepers_Playa';
        else allocationTarget = 'Housekeepers_General';
      }
    } catch (e) {
      // fall back to 'Unit' if anything goes wrong
      allocationTarget = 'Unit';
    }

    // Ensure costCentre mirrors HK target when HK unit selected
    let costCentreOut = values.costCentre || initialValues.costCentre;
    if (String(values.unitId) === '29') {
      costCentreOut = allocationTarget;
    }

    // Normalize: ensure monetary fields are numbers (RHFTextField with isMoney already normalizes decimals)
    const payload = {
      id: initialValues.id,
      date: values.date,
      allocationTarget,
      unitId: values.unitId || initialValues.unitId,
      city: values.city || initialValues.city || undefined,
      categoryId: values.categoryId || initialValues.categoryId,
      costCentre: costCentreOut,
      type: values.type,
      description: values.description,
      notes: values.comments || '', // API expects 'notes'
      paid: values.paid === '' || values.paid == null ? null : Number(values.paid),
      charged: values.charged === '' || values.charged == null ? null : Number(values.charged),
      mirrorToO2: !!values.mirrorToO2,
    };
    if (isNomina && values.description) {
      payload.employeeId = String(values.description);
    }
    if (typeof onSave === 'function') onSave(payload);
  };

  return (
    <RHFForm formId={formId} methods={methods} onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <RHFDatePicker name="date" label="Date" widthVariant="full" />
      </Box>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={widthMap.twoThirds}>
          <RHFSelect
            name="unitId"
            label="Unit"
            options={units}
            getOptionLabel={(o) => o?.unitName ?? o?.label ?? ''}
            getOptionValue={(o) => o?.id}
            widthVariant="full"
          />
        </div>
        <div style={widthMap.oneThird}>
          <RHFSelect
            name="city"
            label="City"
            options={cityOptions}
            getOptionLabel={(o) => (typeof o === 'string' ? o : (o?.label ?? ''))}
            getOptionValue={(o) => (typeof o === 'string' ? o : (o?.value ?? o?.label ?? ''))}
            widthVariant="full"
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={widthMap.twoThirds}>
          <RHFSelect
            name="categoryId"
            label="Category"
            options={categories}
            getOptionLabel={(o) => o?.name ?? ''}
            getOptionValue={(o) => o?.id}
            widthVariant="full"
          />
        </div>
        <div style={widthMap.oneThird}>
          <RHFSelect
            name="type"
            label="Type"
            options={categoryType === 'Both' ? ['Gasto', 'Ingreso'] : [watch('type') || 'Gasto']}
            widthVariant="full"
            SelectProps={{ native: false }}
            disabled={categoryType !== 'Both'}
          />
        </div>
      </div>
      <div style={widthMap.full}>
        <RHFSelect
          name="costCentre"
          label="Cost Centre"
          options={costCentreOptions}
          getOptionLabel={(o) => (typeof o === 'string' ? o : (o?.label ?? ''))}
          getOptionValue={(o) => (typeof o === 'string' ? o : (o?.value ?? o?.label ?? ''))}
          widthVariant="full"
          disabled={Array.isArray(costCentreOptions) && costCentreOptions.length === 1}
        />
      </div>

      {isNomina ? (
        <RHFSelect
          name="description"
          label="Description"
          options={hkEmployeeOptions}
          getOptionLabel={(o) => o?.label ?? ''}
          getOptionValue={(o) => o?.value ?? ''}
          widthVariant="full"
        />
      ) : (
        <RHFTextField name="description" label="Description" widthVariant="full" />
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...widthMap.half, minWidth: 0 }}>
          <RHFTextField name="paid" label="Paid" isMoney widthVariant="full" fullWidth sx={{ minWidth: 0, width: '100%' }} InputProps={{ sx: { width: '100%' } }} />
        </div>
        <div style={{ ...widthMap.half, minWidth: 0 }}>
          <RHFTextField name="charged" label="Charged" isMoney widthVariant="full" fullWidth sx={{ minWidth: 0, width: '100%' }} InputProps={{ sx: { width: '100%' } }} />
        </div>
      </div>
      <RHFTextField name="comments" label="Comments" multiline rows={3} widthVariant="full" />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <RHFFile name="doc1" label="Document 1" accept=".pdf,.jpg,.jpeg,.png" widthVariant="half" />
        <RHFFile name="doc2" label="Document 2" accept=".pdf,.jpg,.jpeg,.png" widthVariant="half" />
      </Box>

    </RHFForm>
  );
}

HKTransactionEditFormRHF.propTypes = {
  formId: PropTypes.string,
  initialValues: PropTypes.object,
  onSave: PropTypes.func,
  onClose: PropTypes.func,
  unitOptions: PropTypes.array,
  categoryOptions: PropTypes.array,
  typeOptions: PropTypes.array,
};