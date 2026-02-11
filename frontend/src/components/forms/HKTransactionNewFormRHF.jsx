import React from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import RHFForm, { RHFTextField, RHFSelect, RHFDatePicker, RHFFile, RHFCheckbox } from './rhf/RHFForm';
import { Box, Button } from '@mui/material';
import api from '../../api';
import { widthMap } from './rhf/widthMap';

/**
 * HKTransactionNewFormRHF
 * -----------------------
 * Housekeeping Transaction form (RHF version) rendered inside AppDrawer.
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
export default function HKTransactionNewFormRHF({
  formId = 'hk-tx-form',
  initialValues = {},
  defaultValues = undefined,
  onSave,
  onSubmit: onSubmitProp,
  onClose,
  unitOptions = null,
  categoryOptions = null,
  typeOptions = ['Ingreso', 'Gasto'],
  hideFileInputs = false,
  showInlineActions = false,
  onCancel,
}) {
  // Prefer defaultValues when provided (e.g. from EmployeeCashAdmin allocation),
  // otherwise fall back to initialValues used in HKTransactions page.
  const effectiveInitial = defaultValues && Object.keys(defaultValues).length
    ? { ...initialValues, ...defaultValues }
    : initialValues;

  // Compute costCentre and allocationTarget default values according to new backend semantics
  const initCity = effectiveInitial.city || '';
  const initCityKey = (initCity ?? '').toString().trim().toLowerCase();
  const initCostCentre = (initCityKey === 'tulum')
    ? 'HK_Tulum'
    : ((initCityKey === 'playa del carmen' || initCityKey === 'playa') ? 'HK_Playa' : 'HK_General');

  // Normalize incoming allocationTarget (backward compatible)
  let initAllocationTarget = effectiveInitial.allocationTarget || effectiveInitial.allocation_target || 'Client';
  if (initAllocationTarget === 'Unit') initAllocationTarget = 'Client';
  if (initAllocationTarget === 'Housekeepers_Both') initAllocationTarget = 'Housekeepers';
  if (['Housekeepers_Playa', 'Housekeepers_Tulum', 'Housekeepers_General'].includes(initAllocationTarget)) initAllocationTarget = 'Housekeepers';
  if (!['Client', 'Owners2', 'Guest', 'Housekeepers'].includes(initAllocationTarget)) initAllocationTarget = 'Client';

  const methods = useForm({
    defaultValues: {
      date: effectiveInitial.date || new Date().toISOString().slice(0,10),
      unitId: effectiveInitial.unitId || '',
      categoryId: effectiveInitial.categoryId || '',
      type: effectiveInitial.type || (typeOptions[1] || 'Gasto'),
      description: effectiveInitial.description || '',
      paid: effectiveInitial.paid ?? '',
      charged: effectiveInitial.charged ?? '',
      comments: effectiveInitial.comments || '',
      doc1: effectiveInitial.doc1 || null,
      doc2: effectiveInitial.doc2 || null,
      mirrorToO2: effectiveInitial.mirrorToO2 ?? false,
      city: effectiveInitial.city || '',
      costCentre: initCostCentre,
      allocationTarget: initAllocationTarget,
    },
    mode: 'onChange',
  });
  const { handleSubmit, setValue, watch } = methods;

  const [units, setUnits] = React.useState(unitOptions || []);
  const [categories, setCategories] = React.useState(categoryOptions || []);
  const [cityOptions, setCityOptions] = React.useState(['Playa del Carmen', 'Tulum', 'General']);
  const [costCentreOptions, setCostCentreOptions] = React.useState(['HK_General']);
  const [allocationTargetOptions] = React.useState(['Client', 'Owners2', 'Guest', 'Housekeepers']);
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
    const current = watch('costCentre');
    let cc = 'HK_General';
    const c = norm(cityVal);
    if (c === 'tulum') cc = 'HK_Tulum';
    else if (c === 'playa del carmen' || c === 'playa') cc = 'HK_Playa';

    setCostCentreOptions([cc]);
    if (current !== cc) {
      setValue('costCentre', cc, { shouldValidate: true, shouldDirty: true });
    }
  }, [cityVal, setValue, watch]);

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
  const isNomina = React.useMemo(() => {
    const found = categories.find(c => String(c.id) === String(catId));
    return norm(found?.name) === 'nomina';
  }, [catId, categories]);

  const descVal = watch('description');
  React.useEffect(() => {
    if (!isNomina) return;
    if (!descVal) return;
    const opt = hkEmployeeOptions.find(o => o.value === descVal);
    if (!opt) return;
    // Force Unit = Housekeepers
    setValue('unitId', hkUnitId, { shouldValidate: true, shouldDirty: true });
    // If API provided a city, set it too
    if (opt.city) {
      setValue('city', opt.city, { shouldValidate: true, shouldDirty: true });
    }
  }, [isNomina, descVal, hkEmployeeOptions, hkUnitId, setValue]);

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

  const paidVal = watch('paid');
  const allocationTargetVal = watch('allocationTarget');

  // When this form is opened from EmployeeCash allocation (sourceType = 'employeeCash')
  // and we already have a Paid value but no Charged, call the markup API once to prefill Charged.
  React.useEffect(() => {
    if (!effectiveInitial || effectiveInitial.sourceType !== 'employeeCash') {
      return;
    }

    // Don't override if user has already edited Charged or it already has a value
    if (userEditedChargedRef.current) return;
    if (chargedVal !== '' && chargedVal != null) return;

    const amountNum = paidVal === '' || paidVal == null ? NaN : Number(paidVal);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/markup/calc', { params: { amount: amountNum } });
        if (cancelled || !data) return;
        settingChargedRef.current = true;
        const next = (typeof data.charged === 'number') ? data.charged.toFixed(2) : String(data.charged);
        setValue('charged', next, { shouldValidate: true, shouldDirty: true });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Markup auto-calc for EmployeeCash allocation failed', e);
      }
    })();

    return () => { cancelled = true; };
  }, [effectiveInitial, paidVal, chargedVal, setValue]);
  React.useEffect(() => {
    // Guard conditions
    const cat = categories.find(c => String(c.id) === String(catId));
    const shouldCalc = cat && inMarkupCategories(cat.name) && allocationTargetVal === 'Client';
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
  }, [paidVal, allocationTargetVal, catId, categories, setValue]);

  const onSubmit = (values) => {
    // Normalize allocationTarget to new model
    let allocationTarget = values.allocationTarget || initAllocationTarget || 'Client';
    if (allocationTarget === 'Unit') allocationTarget = 'Client';
    if (allocationTarget === 'Housekeepers_Both') allocationTarget = 'Housekeepers';
    if (['Housekeepers_Playa', 'Housekeepers_Tulum', 'Housekeepers_General'].includes(allocationTarget)) {
      allocationTarget = 'Housekeepers';
    }
    if (!['Client', 'Owners2', 'Guest', 'Housekeepers'].includes(allocationTarget)) {
      allocationTarget = 'Client';
    }

    // costCentre is HK_* derived from city (also enforced by backend)
    const costCentreOut = values.costCentre || initCostCentre || 'HK_General';

    const payload = {
      date: values.date,
      allocationTarget,
      unitId: values.unitId || effectiveInitial.unitId,
      city: values.city || effectiveInitial.city || undefined,
      categoryId: values.categoryId || effectiveInitial.categoryId,
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

    // Prefer explicit onSubmit prop (used by allocation flows),
    // fall back to legacy onSave when present.
    if (typeof onSubmitProp === 'function') {
      return onSubmitProp(payload);
    }
    if (typeof onSave === 'function') {
      return onSave(payload);
    }
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
          name="allocationTarget"
          label="Allocation Target"
          options={allocationTargetOptions}
          getOptionLabel={(o) => (typeof o === 'string' ? o : (o?.label ?? ''))}
          getOptionValue={(o) => (typeof o === 'string' ? o : (o?.value ?? o?.label ?? ''))}
          widthVariant="full"
        />
      </div>

      <div style={widthMap.full}>
        <RHFSelect
          name="costCentre"
          label="Cost Centre"
          options={costCentreOptions}
          getOptionLabel={(o) => (typeof o === 'string' ? o : (o?.label ?? ''))}
          getOptionValue={(o) => (typeof o === 'string' ? o : (o?.value ?? o?.label ?? ''))}
          widthVariant="full"
          disabled
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
          <RHFTextField
            name="paid"
            label="Paid"
            isMoney
            widthVariant="full"
            fullWidth
            sx={{ minWidth: 0, width: '100%' }}
            InputProps={{ sx: { width: '100%' } }}
          />
        </div>
        <div style={{ ...widthMap.half, minWidth: 0 }}>
          <RHFTextField
            name="charged"
            label="Charged"
            isMoney
            widthVariant="full"
            fullWidth
            sx={{ minWidth: 0, width: '100%' }}
            InputProps={{ sx: { width: '100%' } }}
          />
        </div>
      </div>
      <RHFTextField name="comments" label="Comments" multiline rows={3} widthVariant="full" />

      {!hideFileInputs && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <RHFFile name="doc1" label="Document 1" accept=".pdf,.jpg,.jpeg,.png" widthVariant="half" />
          <RHFFile name="doc2" label="Document 2" accept=".pdf,.jpg,.jpeg,.png" widthVariant="half" />
        </Box>
      )}

      {showInlineActions && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mt: 2,
            gap: 1,
          }}
        >
          <Button
            variant="text"
            onClick={(e) => {
              e.preventDefault();
              if (onCancel) {
                onCancel();
              } else if (onClose) {
                onClose();
              }
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
          >
            Save
          </Button>
        </Box>
      )}

    </RHFForm>
  );
}

HKTransactionNewFormRHF.propTypes = {
  formId: PropTypes.string,
  initialValues: PropTypes.object,
  defaultValues: PropTypes.object,
  onSave: PropTypes.func,
  onSubmit: PropTypes.func,
  onClose: PropTypes.func,
  unitOptions: PropTypes.array,
  categoryOptions: PropTypes.array,
  typeOptions: PropTypes.array,
  hideFileInputs: PropTypes.bool,
  showInlineActions: PropTypes.bool,
  onCancel: PropTypes.func,
};