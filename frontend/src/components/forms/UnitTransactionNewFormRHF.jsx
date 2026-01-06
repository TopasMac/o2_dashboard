
import React from 'react';
import PropTypes from 'prop-types';
import { useForm, useWatch } from 'react-hook-form';
import RHFForm, { RHFAutocomplete } from './rhf/RHFForm';
import RHFTextField from './rhf/RHFTextField';
import RHFSelect from './rhf/RHFSelect';
import RHFDatePicker from './rhf/RHFDatePicker';
import RHFCheckbox from './rhf/RHFCheckbox';
import RHFFile from './rhf/RHFFile';
import api from '../../api';
import { Box, Button } from '@mui/material';

// Helper to decode JWT name from localStorage token
const getAuthName = () => {
  try {
    const raw = localStorage.getItem('token') || '';
    const [, payloadB64] = raw.split('.') || [];
    if (!payloadB64) return null;
    const json = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    return json?.name || json?.username || null;
  } catch { return null; }
};

function toISODateInput(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function UnitTransactionNewFormRHF({
  onSave,
  onClose,
  onSubmit: onSubmitProp,
  showO2Mirror = true,
  unitId,
  defaultAmount,
  defaultService,
  defaultDate,
  transactionCategoryId,
  costCenter,
  formId = 'unit-tx-form',
  noDropdowns = false,
  showAttachment = true,
  showInlineActions = false,
}) {
  const methods = useForm({
    defaultValues: {
      date: toISODateInput(),
      unit: null,
      category: null,
      type: 'Ingreso', // or 'Egreso'
      description: '',
      amount: '',
      comments: '',
      doc1: null,
      addToO2: false,
      unitName: '',
      categoryName: '',
    }
  });

  const { handleSubmit, watch, setValue } = methods;

  // Stable field watchers
  const unitWatch = useWatch({ control: methods.control, name: 'unit' });
  const categoryWatch = useWatch({ control: methods.control, name: 'category' });
  const descriptionWatch = useWatch({ control: methods.control, name: 'description' });
  const amountWatch = useWatch({ control: methods.control, name: 'amount' });

  // Live options from API (moved up so refs exist before effects)
  const [unitOptions, setUnitOptions] = React.useState([]);
  const [categoryOptions, setCategoryOptions] = React.useState([]);
  const categoriesByIdRef = React.useRef(new Map());
  const categoriesByLabelRef = React.useRef(new Map());
  const [selectedUnit, setSelectedUnit] = React.useState(null); // full unit details

  const unitLabel = React.useMemo(() => {
    const val = (typeof unitWatch === 'string') ? Number(unitWatch) : unitWatch;
    const found = unitOptions.find(o => o.value === val);
    return found ? found.label : '';
  }, [unitWatch, unitOptions]);

  const categoryLabel = React.useMemo(() => {
    const val = (typeof categoryWatch === 'string') ? Number(categoryWatch) : categoryWatch;
    const meta = categoriesByIdRef.current.get(val);
    return meta ? meta.label : '';
  }, [categoryWatch, categoryOptions]);

  React.useEffect(() => { setValue('unitName', unitLabel || ''); }, [unitLabel, setValue]);
  React.useEffect(() => { setValue('categoryName', categoryLabel || ''); }, [categoryLabel, setValue]);

  React.useEffect(() => {
    if (defaultDate) setValue('date', defaultDate);
    if (defaultAmount != null) setValue('amount', String(defaultAmount));
    if (defaultService) setValue('description', String(defaultService));
  }, [defaultDate, defaultAmount, defaultService, setValue]);

  React.useEffect(() => {
    if (!noDropdowns) return;
    if (unitId == null || unitId === '') return;
    setValue('unit', Number(unitId), { shouldDirty: true, shouldValidate: true });
  }, [noDropdowns, unitId, setValue]);

  React.useEffect(() => {
    if (!unitOptions || unitOptions.length === 0) return;
    const current = unitWatch;
    if ((current == null || current === '') && unitId != null) {
      setValue('unit', Number(unitId), { shouldDirty: true, shouldValidate: true });
    }
  }, [unitOptions, unitId, setValue, unitWatch]);

  React.useEffect(() => {
    if (!categoryOptions || categoryOptions.length === 0) return;
    const category = categoryWatch;
    if (category) return;
    const inServicesPaymentsV2 = defaultService || (defaultAmount != null) || (unitId != null);
    if (!inServicesPaymentsV2) return;
    if (transactionCategoryId != null) {
      setValue('category', Number(transactionCategoryId), { shouldDirty: true, shouldValidate: true });
    } else {
      const cat = categoriesByLabelRef.current.get('pago de servicios');
      if (cat) {
        setValue('category', cat.value, { shouldDirty: true, shouldValidate: true });
      }
    }
    setValue('type', 'Gasto', { shouldDirty: true, shouldValidate: true });
  }, [categoryOptions, defaultService, defaultAmount, unitId, transactionCategoryId, setValue, categoriesByLabelRef, categoryWatch]);

  const fetchJSON = async (url) => {
    const { data } = await api.get(url);
    return data;
  };

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Units (Active only; lean fields)
        const units = await fetchJSON('/api/unit-list?status=Active&fields=id,unit_name');
        if (!alive) return;
        const unitOpts = Array.isArray(units)
          ? units.map(u => ({ value: Number(u.id), label: String(u.unit_name || u.unitName || `#${u.id}`) }))
          : [];
        setUnitOptions(unitOpts);

        // Categories (only those allowed for unit transactions)
        const cats = await fetchJSON('/api/transaction_categories?pagination=false');
        if (!alive) return;
        const allowedCats = Array.isArray(cats)
          ? cats.filter(c => {
              const raw = c?.allow_unit ?? c?.allowUnit ?? c?.allowunit;
              if (typeof raw === 'string') {
                const s = raw.trim().toLowerCase();
                return s === '1' || s === 'true' || s === 'yes';
              }
              return raw === 1 || raw === true;
            })
          : [];
        const catOpts = allowedCats.map(c => {
          const value = Number(c.id ?? c.value);
          const label = String(c.label ?? c.name ?? '');
          const type = String(c.type ?? c.categoryType ?? '').trim(); // 'Ingreso' | 'Egreso' | 'Both'
          categoriesByIdRef.current.set(value, { value, label, type });
          categoriesByLabelRef.current.set(label.toLowerCase(), { value, label, type });
          return { value, label, type };
        });
        setCategoryOptions(catOpts);
      } catch (e) {
        console.warn('Failed to load units/categories:', e);
      }
    })();
    return () => { alive = false; };
  }, []);

  const unitField = watch('unit');
  React.useEffect(() => {
    let alive = true;
    const idNum = Number(unitField);
    if (unitField == null || unitField === '' || Number.isNaN(idNum)) {
      setSelectedUnit(null);
      return undefined;
    }
    (async () => {
      try {
        const det = await fetchJSON(`/api/units/${idNum}`);
        if (!alive) return;
        setSelectedUnit(det || null);
      } catch (e) {
        console.warn('Failed to load unit details:', e);
        setSelectedUnit(null);
      }
    })();
    return () => { alive = false; };
  }, [unitField]);

  const categoryField = watch('category');
  const isReimbursementCategory = React.useMemo(() => {
    const idNum = Number(categoryField);
    return idNum === 3 || idNum === 6;
  }, [categoryField]);

  // Robustly detect "Pago de Servicios" category (id or label)
  const isServicePaymentCategory = React.useMemo(() => {
    const raw = categoryField;
    const idNum = Number(raw);
    if (!Number.isNaN(idNum) && idNum === 1) return true; // id = 1
    const meta = categoriesByIdRef.current.get(idNum || raw);
    const label = (meta?.label || meta?.name || '').toString().toLowerCase();
    if (label.includes('pago de servicios')) return true;
    return false;
  }, [categoryField]);
  
  React.useEffect(() => {
    if (!isReimbursementCategory) {
      // Ensure the mirror flag is cleared if user changes away from 3/6
      setValue('addToO2', false, { shouldDirty: true, shouldValidate: false });
    }
  }, [isReimbursementCategory, setValue]);
  React.useEffect(() => {
    if (!categoryField) return;
    const meta = categoriesByIdRef.current.get(categoryField);
    if (!meta) return;
    // If category has fixed type (Ingreso/Egreso), enforce it
    const fixed = (meta.type || '').toLowerCase();
    if (fixed === 'ingreso') {
      setValue('type', 'Ingreso', { shouldDirty: true, shouldValidate: true });
    } else if (fixed === 'egreso' || fixed === 'gasto') {
      setValue('type', 'Gasto', { shouldDirty: true, shouldValidate: true });
    }
  }, [categoryField, setValue]);

  const descriptionField = watch('description');
  React.useEffect(() => {
    // Apply only if amount is empty and we have unit details
    const amountVal = amountWatch;
    if (amountVal && String(amountVal).trim() !== '') return;

    // Identify "Pago de Servicios" category by label (case-insensitive)
    const catMeta = categoriesByIdRef.current.get(categoryField);
    const isServicePayment =
      !!catMeta && typeof catMeta.label === 'string' &&
      catMeta.label.toLowerCase().includes('pago de servicios');

    if (!isServicePayment || !selectedUnit) return;

    const desc = String(descriptionField || '').toLowerCase();
    const det = selectedUnit || {};
    // Try to map based on keywords; fallback leaves amount untouched
    let auto = null;
    if (desc.includes('hoa')) auto = det.hoaAmount ?? det.hoaFee ?? null;
    else if (desc.includes('internet')) auto = det.internetCost ?? det.internetFee ?? null;
    else if (desc.includes('water') || desc.includes('agua')) auto = det.waterCost ?? null;
    else if (desc.includes('cfe') || desc.includes('electric')) auto = det.electricityCost ?? det.cfeCost ?? null;

    if (auto != null && !Number.isNaN(Number(auto))) {
      const normalized = Number(auto);
      setValue('amount', String(normalized), { shouldDirty: true, shouldValidate: true });
    }
  }, [categoryField, descriptionField, selectedUnit, setValue, amountWatch]);

  const mapDocCategory = (desc) => {
    const s = String(desc || '').toLowerCase();
    if (s.includes('hoa')) return 'hoa-payment';
    if (s.includes('aguakan') || s.includes('water') || s.includes('agua')) return 'water-payment';
    if (s.includes('internet') || s.includes('totalplay') || s.includes('telmex')) return 'internet-payment';
    if (s.includes('cfe') || s.includes('electric')) return 'cfe-payment';
    return 'reporte-pago';
  };

  const handleSubmitInternal = async (data) => {
    // Field already stores dot-decimal; only translate comma to dot
    const normalizedAmountStr = String(data.amount || '').replace(',', '.');

    // Determine sign by type (user types positive)
    let normalizedAmount = normalizedAmountStr === '' ? null : Number(normalizedAmountStr);
    if (normalizedAmount != null && !Number.isNaN(normalizedAmount)) {
      normalizedAmount = Math.abs(normalizedAmount);
    }

    // Compute API IRI for category
    const categoryIri = (data.category == null || data.category === '')
      ? null
      : (typeof data.category === 'string' && data.category.startsWith('/api/'))
        ? data.category
        : `/api/transaction_categories/${Number(data.category)}`;

    const unitIdNumber = (data.unit != null && data.unit !== '' && !Number.isNaN(Number(data.unit)))
      ? Number(data.unit)
      : ((unitId != null && unitId !== '' && !Number.isNaN(Number(unitId))) ? Number(unitId) : null);

    const unitIri = (unitIdNumber == null)
      ? null
      : `/api/units/${unitIdNumber}`;

    const txPayload = {
      date: data.date,
      unit: unitIri,
      category: categoryIri,
      type: data.type || 'Ingreso',
      description: data.description || '',
      amount: normalizedAmount == null ? null : Number(normalizedAmount).toFixed(2),
      comments: data.comments || '',
      costCenter: 'Client',
    };

    // Compute the numeric category id to use for upload (from form selection, or fallback to prop)
    const finalCategoryId = (data.category != null && data.category !== '')
      ? Number(data.category)
      : (transactionCategoryId != null ? Number(transactionCategoryId) : 0);

    const docCategory = mapDocCategory(txPayload.description);

    let createdTx = null;
    try {
      const res = await api.post('/api/unit_transactions', txPayload);
      createdTx = res.data;
    } catch (err) {
      console.error('Create unit transaction failed:', err);
      alert('Could not create the transaction. Please try again.');
      return;
    }

    // Upload single attachment via centralized endpoint (replace any existing one on this row)
    const uploadSingle = async (fileObj, fieldName) => {
      const resolveFile = (input) => {
        if (!input) return null;
        if (input instanceof File) return input;
        if (Array.isArray(input)) return (input[0] instanceof File ? input[0] : null);
        if (typeof input === 'object') {
          if (input.file instanceof File) return input.file;
          if (input.files && input.files[0] instanceof File) return input.files[0];
          if (input[0] instanceof File) return input[0];
          if (input.value instanceof File) return input.value;
        }
        if (typeof window !== 'undefined' && fieldName) {
          const inputEl = document.querySelector(`input[name="${fieldName}"]`);
          if (inputEl && inputEl.files && inputEl.files[0] instanceof File) {
            return inputEl.files[0];
          }
        }
        return null;
      };

      const file = resolveFile(fileObj);
      if (!file || !createdTx?.id) return;

      const fd = new FormData();
      fd.append('file', file, file.name);
      // Centralized attachment params
      fd.append('targetType', 'unit_transactions');
      fd.append('targetId', String(createdTx.id));

      // Compute human-readable category name for document metadata
      const humanCategory = (data?.categoryName && String(data.categoryName).trim() !== '')
        ? String(data.categoryName).trim()
        : (categoryLabel || '');
      // Prefer human-readable category name; backend will use this as normalized category
      if (humanCategory) fd.append('category', humanCategory);
      if (finalCategoryId) fd.append('categoryId', String(finalCategoryId));
      if (humanCategory) fd.append('categoryName', humanCategory);

      fd.append('mode', 'replace');           // enforce only 1 attachment per row
      fd.append('scope', 'per-parent');       // replace regardless of category

      // Optional metadata to keep nice filenames/paths server-side
      if (unitIdNumber != null) fd.append('unitId', String(unitIdNumber));
      if (txPayload.description) fd.append('description', txPayload.description);
      if (txPayload.date) fd.append('dateForName', txPayload.date);

      try {
        await api.post('/api/documents', fd);
      } catch (e) {
        console.warn('Document upload failed:', e?.response?.data || e.message);
      }
    };

    try {
      await uploadSingle(data.doc1, 'doc1');
    } catch (err) {
      console.warn('Upload failed:', err);
      // continue; the transaction is already created
    }

    // Mirror to O2 (reimbursement) if requested
    try {
      const doMirror = showO2Mirror && data.addToO2 === true;
      if (doMirror) {
        const cityVal = selectedUnit?.city || '';
        const costCentreO2 = cityVal === 'Playa del Carmen' ? 'Owners2_Playa' : (cityVal === 'Tulum' ? 'Owners2_Tulum' : 'Owners2');
        const createdByName = getAuthName();

        const o2Payload = {
          date: txPayload.date,
          category: finalCategoryId || undefined, // API expects 'category' (id)
          type: 'Gasto',
          description: txPayload.description,
          amount: normalizedAmount == null ? null : Math.abs(Number(normalizedAmount)).toFixed(2),
          comments: txPayload.comments || '',
          city: cityVal,
          costCentre: costCentreO2,
          private: false,
          ...(createdByName ? { createdBy: createdByName } : {}),
        };

        await api.post('/api/o2transactions', o2Payload);
      }
    } catch (e) {
      console.warn('O2 mirror failed:', e?.response?.data || e.message);
    }

    // Notify parent and close
    if (typeof onSave === 'function') onSave(createdTx);
    if (typeof onClose === 'function') onClose();
  };

  return (
    <RHFForm
      formId={formId}
      methods={methods}
      onSubmit={onSubmitProp || handleSubmitInternal}
      style={{ display: 'grid', gap: 12 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <RHFDatePicker name="date" label="Date" widthVariant="half" />
        {noDropdowns ? (
          <>
            <input type="hidden" name="unit" value={unitWatch ?? ''} />
            <RHFTextField name="unitName" label="Unit" widthVariant="full" disabled />
          </>
        ) : (
          <RHFAutocomplete name="unit" label="Unit" options={unitOptions} placeholder="Search unit..." widthVariant="full" />
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {noDropdowns ? (
          <>
            <input type="hidden" name="category" value={categoryWatch ?? ''} />
            <RHFTextField name="categoryName" label="Category" widthVariant="half" disabled />
            <RHFTextField name="type" label="Type" widthVariant="third" disabled />
          </>
        ) : (
          <>
            <RHFSelect name="category" label="Category" options={categoryOptions} widthVariant="half" />
            <RHFSelect name="type" label="Type" options={['Ingreso', 'Gasto']} widthVariant="half" />
          </>
        )}
      </div>

      {isServicePaymentCategory ? (
        <RHFSelect
          name="description"
          label="Description"
          options={['Aguakan', 'CFE', 'HOA', 'Internet']}
          widthVariant="full"
        />
      ) : (
        <RHFTextField name="description" label="Description" placeholder="" widthVariant="full" />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <RHFTextField name="amount" label="Amount" isMoney widthVariant="half" />
        <RHFTextField name="comments" label="Comments" multiline rows={3} widthVariant="full" />
      </div>

      {showAttachment && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <RHFFile
            name="doc1"
            label="Document 1"
            accept=".pdf,.jpg,.jpeg,.png"
            widthVariant="half"
          />
        </div>
      )}

      {showO2Mirror && isReimbursementCategory && (
        <div style={{ marginTop: 4 }}>
          <RHFCheckbox name="addToO2" label="Mirror to O2 (reimbursement)" />
        </div>
      )}

      {showInlineActions && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mt: 2,
          }}
        >
          <Box />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button type="button" variant="text" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="contained">
              Save
            </Button>
          </Box>
        </Box>
      )}
    </RHFForm>
  );
}

UnitTransactionNewFormRHF.propTypes = {
  onSave: PropTypes.func,
  onClose: PropTypes.func,
  onSubmit: PropTypes.func,
  showO2Mirror: PropTypes.bool,
  unitId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  defaultAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  defaultService: PropTypes.string,
  defaultDate: PropTypes.string,
  transactionCategoryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  costCenter: PropTypes.string,
  formId: PropTypes.string,
  noDropdowns: PropTypes.bool,
  showAttachment: PropTypes.bool,
  showInlineActions: PropTypes.bool,
};
