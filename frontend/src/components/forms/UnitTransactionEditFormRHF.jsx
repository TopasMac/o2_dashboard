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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { RHFFileClipIcon } from './rhf/RHFFile';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

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

export default function UnitTransactionEditFormRHF({
  onSave,
  onClose,
  transactionId,
  initialData,
  unitId,
  defaultAmount,
  defaultService,
  defaultDate,
  transactionCategoryId,
  costCenter,
  formId = 'unit-tx-form',
  noDropdowns = false,
}) {
  const methods = useForm({
    defaultValues: {
      date: '',
      unit: null,
      category: null,
      type: '',
      description: '',
      amount: '',
      comments: '',
      doc1: null,
      unitName: '',
      categoryName: '',
    }
  });

  const { handleSubmit, watch, setValue } = methods;

  // Populate form for edit mode
  React.useEffect(() => {
    const apply = (src) => {
      if (!src) return;
      // Normalize and set values
      setValue('date', src.date ? String(src.date).slice(0, 10) : '');
      // Unit: API may return only unitName (no id). Try id first; if missing, remember name to resolve after options load.
      let unitIdFromSrc = null;
      if (typeof src.unit === 'string') {
      const maybe = Number(src.unit.split('/').pop());
      if (!Number.isNaN(maybe)) unitIdFromSrc = maybe;
    } else if (typeof src.unit === 'object' && src.unit) {
      const maybe = Number(src.unit.id);
      if (!Number.isNaN(maybe)) unitIdFromSrc = maybe;
      if (src.unit.unitName) desiredUnitNameRef.current = String(src.unit.unitName);
    } else {
      const maybe = Number(src.unitId || src.unit_id);
      if (!Number.isNaN(maybe)) unitIdFromSrc = maybe;
    }
if (unitIdFromSrc != null) {
  setValue('unit', unitIdFromSrc);
} else if (src.unitName) {
  desiredUnitNameRef.current = String(src.unitName);
}
      // Category can be id or IRI
      const catIdFromSrc = typeof src.category === 'string'
        ? Number(src.category.split('/').pop())
        : (typeof src.category === 'object' ? Number(src.category.id) : Number(src.categoryId || src.category_id));
      if (!Number.isNaN(catIdFromSrc)) setValue('category', catIdFromSrc);
      setValue('type', src.type || '');
      setValue('description', src.description || '');
      // Amount should be shown as absolute text, no sign flip on edit; backend already stores sign
      if (src.amount != null) setValue('amount', String(Math.abs(Number(src.amount))));
      setValue('comments', src.comments || '');
      // Unit/category display names (if present)
      if (src.unitName) setValue('unitName', src.unitName);
      if (src.categoryName) setValue('categoryName', src.categoryName);
    };
    if (initialData) {
      apply(initialData);
      return;
    }
    const idNum = Number(transactionId);
    if (!transactionId || Number.isNaN(idNum)) return;
    (async () => {
      try {
        const { data } = await api.get(`/api/unit_transactions/${idNum}`);
        apply(data);
      } catch (e) {
        console.warn('Failed to load transaction for edit:', e);
      }
    })();
  }, [initialData, transactionId, setValue]);

  // Stable field watchers
  const unitWatch = useWatch({ control: methods.control, name: 'unit' });
  const categoryWatch = useWatch({ control: methods.control, name: 'category' });
  const descriptionWatch = useWatch({ control: methods.control, name: 'description' });
  const amountWatch = useWatch({ control: methods.control, name: 'amount' });

  // Live options from API (moved up so refs exist before effects)
  const [unitOptions, setUnitOptions] = React.useState([]);
  const [categoryOptions, setCategoryOptions] = React.useState([]);
  const [existingDoc, setExistingDoc] = React.useState(null);
  const [pendingDelete, setPendingDelete] = React.useState(false);
  const categoriesByIdRef = React.useRef(new Map());
  const categoriesByLabelRef = React.useRef(new Map());
  const [selectedUnit, setSelectedUnit] = React.useState(null); // full unit details
  const desiredUnitNameRef = React.useRef(null);

  const unitLabel = React.useMemo(() => {
    const val = (typeof unitWatch === 'string') ? Number(unitWatch) : unitWatch;
    const found = unitOptions.find(o => o.id === val);
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
          ? units.map(u => ({ id: Number(u.id), label: String(u.unit_name || u.unitName || `#${u.id}`) }))
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

  React.useEffect(() => {
    const desired = (desiredUnitNameRef.current || '').trim();
    if (!desired) return;
    const currentVal = methods.getValues('unit');
    if (currentVal != null && String(currentVal) !== '') return; // already resolved
    const match = unitOptions.find(o => String(o.label).toLowerCase() === desired.toLowerCase());
    if (match) {
      setValue('unit', match.id, { shouldDirty: false, shouldValidate: true });
    }
  }, [unitOptions, methods, setValue]);

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

  // Fetch latest existing attachment for this transaction
  React.useEffect(() => {
    let alive = true;
    const idNum = Number(transactionId);
    if (!idNum) return undefined;
    (async () => {
      try {
        const { data } = await api.post('/api/unit-documents/lookup', {
          targetType: 'unit_transactions',
          targetId: idNum,
          latest: true,
        });
        if (!alive) return;
        const doc = data?.document || data?.result || null; // defensive: support either shape
        setExistingDoc(doc);
        setPendingDelete(false);
      } catch (e) {
        setExistingDoc(null);
        setPendingDelete(false);
      }
    })();
    return () => { alive = false; };
  }, [transactionId]);

  const categoryField = watch('category');
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

  const handleChangeFileClick = async () => {
    // Do not delete now; mark intent and reveal picker. Actual removal happens on submit.
    if (existingDoc?.id) {
      setPendingDelete(true);
      setTimeout(() => {
        const inputEl = document.querySelector('input[name="doc1"]');
        if (inputEl) inputEl.click();
      }, 0);
      return;
    }
    const inputEl = document.querySelector('input[name="doc1"]');
    if (inputEl) inputEl.click();
  };

  const handleDeleteExisting = async () => {
    if (!existingDoc?.id) return;
    const ok = window.confirm('Remove the current attachment? It will only be deleted after you save.');
    if (!ok) return;
    // Just mark for deletion; actual delete occurs on submit.
    setPendingDelete(true);
  };

  const onSubmit = async (data) => {
    // Field already stores dot-decimal; only translate comma to dot
    const normalizedAmountStr = String(data.amount || '').replace(',', '.');
    // In edit, keep the existing sign in the backend; we send the absolute value and let 'type' represent the sign
    const normalizedAmount = normalizedAmountStr === '' ? null : Number(normalizedAmountStr);

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

    const idNum = Number(transactionId);
    if (!idNum) {
      alert('Missing transaction id for edit.');
      return;
    }
    try {
      await api.patch(`/api/unit_transactions/${idNum}`, txPayload);
    } catch (err) {
      console.error('Update unit transaction failed:', err);
      alert('Could not update the transaction. Please try again.');
      return;
    }

    // Determine if a new file is being uploaded (used for deferred delete logic)
    const resolveForSubmit = (input) => {
      if (!input) return null;
      if (input instanceof File) return input;
      if (Array.isArray(input)) return (input[0] instanceof File ? input[0] : null);
      if (typeof input === 'object') {
        if (input.file instanceof File) return input.file;
        if (input.files && input.files[0] instanceof File) return input.files[0];
        if (input[0] instanceof File) return input[0];
        if (input.value instanceof File) return input.value;
      }
      const inputEl = (typeof window !== 'undefined') ? document.querySelector('input[name="doc1"]') : null;
      if (inputEl && inputEl.files && inputEl.files[0] instanceof File) return inputEl.files[0];
      return null;
    };
    const newlySelectedFile = resolveForSubmit(data.doc1);

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
      const idNum = Number(transactionId);
      if (!file || !idNum) return;

      const fd = new FormData();
      fd.append('file', file, file.name);

      // Centralized attachment params
      fd.append('targetType', 'unit_transactions');
      fd.append('targetId', String(idNum));

      // Human-readable category and numeric id for backend naming/partitioning
      const humanCategory = (methods.getValues('categoryName') || '') || (categoryLabel || '');
      if (humanCategory) fd.append('category', humanCategory);
      const finalCategoryIdStr = (methods.getValues('category') || finalCategoryId || '').toString();
      if (finalCategoryIdStr) fd.append('categoryId', finalCategoryIdStr);
      if (humanCategory) fd.append('categoryName', humanCategory);

      // Description and date used for filename
      const desc = (methods.getValues('description') || '').trim();
      if (desc) fd.append('description', desc);
      const dateForName = methods.getValues('date');
      if (dateForName) fd.append('dateForName', dateForName);

      // Enforce only 1 attachment per row
      fd.append('mode', 'replace');
      fd.append('scope', 'per-parent');

      // Helpful extra context for backend pathing
      if (unitIdNumber != null) fd.append('unitId', String(unitIdNumber));

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
      // continue; the transaction is already updated
    }

    // If user marked delete and did not upload a replacement, delete now
    if (pendingDelete && existingDoc?.id && !newlySelectedFile) {
      try {
        await api.delete(`/api/unit-documents/${existingDoc.id}`);
      } catch (e) {
        console.warn('Deferred delete failed:', e?.response?.data || e.message);
      }
    }


    setPendingDelete(false);
    // Notify parent and close
    if (typeof onSave === 'function') onSave({ id: Number(transactionId) });
    if (typeof onClose === 'function') onClose();
  };

  return (
    <RHFForm formId={formId} methods={methods} onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <RHFDatePicker name="date" label="Date" widthVariant="half" />
        {noDropdowns ? (
          <>
            <input type="hidden" name="unit" value={unitWatch ?? ''} />
            <RHFTextField name="unitName" label="Unit" widthVariant="full" disabled />
          </>
        ) : (
          <RHFAutocomplete
            name="unit"
            label="Unit"
            options={unitOptions}
            placeholder="Search unit..."
            widthVariant="full"
            getOptionValue={(o) => (o ? o.id : null)}
            getOptionLabel={(o) => (o?.label ?? '')}
            isOptionEqualToValue={(opt, val) => {
              const left = opt ? Number(opt.id) : null;
              const right = (val && typeof val === 'object') ? Number(val.id) : Number(val);
              return left === right;
            }}
          />
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

      <RHFTextField name="description" label="Description" placeholder="" widthVariant="full" />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <RHFTextField name="amount" label="Amount" isMoney widthVariant="half" />
        <RHFTextField name="comments" label="Comments" multiline rows={3} widthVariant="full" />
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {existingDoc?.s3Url && !pendingDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <RHFFileClipIcon />
            <a
              href={existingDoc.s3Url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', color: '#1E6F68' }}
            >
              {existingDoc.filename || 'Current attachment'}
            </a>
            <span style={{ opacity: 0.5 }}>|</span>
            <button
              type="button"
              onClick={handleChangeFileClick}
              title="Change file"
              aria-label="Change file"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#1976d2', display: 'inline-flex', alignItems: 'center' }}
            >
              <ArrowPathIcon style={{ width: 16, height: 16, color: '#F59E0B' }} />
            </button>
            <span style={{ opacity: 0.5 }}>|</span>
            <button
              type="button"
              onClick={handleDeleteExisting}
              title="Delete attachment"
              aria-label="Delete attachment"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#d32f2f', display: 'inline-flex', alignItems: 'center' }}
            >
              {DeleteOutlineIcon ? <DeleteOutlineIcon fontSize="inherit" /> : <span aria-hidden>✖</span>}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {pendingDelete && existingDoc?.filename && (
              <div style={{ fontSize: 12, color: '#B45309' }}>
                The current file <strong>{existingDoc.filename}</strong> will be deleted when you save.
              </div>
            )}
            <RHFFile name="doc1" label="Attachment" accept=".pdf,.jpg,.jpeg,.png" widthVariant="full" />
          </div>
        )}
      </div>

    </RHFForm>
  );
}

UnitTransactionEditFormRHF.propTypes = {
  onSave: PropTypes.func,
  onClose: PropTypes.func,
  transactionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  initialData: PropTypes.object,
  unitId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  defaultAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  defaultService: PropTypes.string,
  defaultDate: PropTypes.string,
  transactionCategoryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  costCenter: PropTypes.string,
  formId: PropTypes.string,
  noDropdowns: PropTypes.bool,
};
