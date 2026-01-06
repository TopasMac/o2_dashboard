import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FormLayoutInline from '../../layouts/FormLayoutInline';
import api from '../../../api';
import '../../layouts/Buttons.css';
import '../../layouts/FormLayoutInline.css';

// Safe back navigation: only if referrer is same-origin
const canSafeBack = () => {
  try {
    const ref = document.referrer || '';
    return ref.startsWith(window.location.origin) && window.history && window.history.length > 1;
  } catch (_) { return false; }
};

// Accept images or PDFs as proof of payment

// File size limit for uploads (600 KB)
const MAX_FILE_BYTES = 600 * 1024; // 600 KB limit (base64 grows ~33%)

// Reads JWT from localStorage and returns { Authorization: 'Bearer <token>' } or {}
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Helper: Convert File to Data URL (base64)
const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// Normalize for accent-insensitive, case-insensitive search
const norm = (s) => (s || '')
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const makeInitialForm = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return {
    unitId: '',
    unitName: '',
    date: `${yyyy}-${mm}-${dd}`,
    entryType: 'O2_PAYMENT',
    amount: '',
    paymentMethod: 'Transfer',
    reference: '',
    note: '',
  };
};

const mergeDefaults = (base, defs) => {
  if (!defs) return base;
  const out = { ...base };
  if (defs.unitId != null) out.unitId = String(defs.unitId);
  if (defs.unitName != null) out.unitName = String(defs.unitName);
  if (defs.date) out.date = String(defs.date);
  if (defs.entryType) out.entryType = String(defs.entryType);
  if (defs.amount != null) out.amount = String(defs.amount);
  if (defs.paymentMethod != null) out.paymentMethod = String(defs.paymentMethod);
  if (defs.reference != null) out.reference = String(defs.reference);
  if (defs.note != null) out.note = String(defs.note);
  return out;
};

export default function NewUnitLedgerForm({
  defaults,
  mode,
  onCancel,
  onSuccess,
  enforcePartialRules = false,
  requiredAmount = null,
  caller,
  // Parent-provided context (Unit Monthly Report page)
  unitId: ctxUnitId,
  unitName: ctxUnitName,
  // NEW optional presets (applied only if provided)
  presetUnitId,
  presetUnitName,
  presetDate,
  presetEntryType,
  presetReference,
  lockUnit = false,
  // Unit Monthly Report context
  closingBalance = null, // number (can be negative)
  yearMonth = '',        // 'YYYY-MM'
}) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [paymentFile, setPaymentFile] = useState(null); // File | null

  const [fileError, setFileError] = useState("");


  // Units for dropdown
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState(null);


  const [form, setForm] = useState(() => {
    const base = mergeDefaults(makeInitialForm(), defaults);
    // Normalize Unit from context props or presets
    const incomingId = ctxUnitId ?? presetUnitId;
    const incomingName = ctxUnitName ?? presetUnitName;
    if (incomingId != null) {
      base.unitId = String(incomingId);
      base.unit = `/api/units/${String(incomingId)}`;
    }
    if (incomingName) {
      base.unitName = String(incomingName);
    }
    if (caller === 'confirm-payment') {
      // Default to O2 Payment and Transfer method
      if (!base.entryType || base.entryType === 'REPORT_POSTING') base.entryType = 'O2_PAYMENT';
      if (!base.paymentMethod) base.paymentMethod = 'Transfer';
      // Prefill amount with closing balance so it gets POSTed even before any change
      if (requiredAmount != null && (base.amount === '' || base.amount == null)) {
        const amt = Number(requiredAmount);
        if (!Number.isNaN(amt)) base.amount = String(amt.toFixed(2));
      }
    }
    if (caller === 'unit-balance') {
      if (!base.paymentMethod) base.paymentMethod = 'Transfer';
    }
    // Defaults derived from closing balance & period, regardless of caller
    const cb = (typeof closingBalance === 'number') ? closingBalance : null;
    if (cb != null) {
      if (cb > 0) {
        // We owe client → O2 Payment (Owners2 → Client)
        base.entryType = 'O2_PAYMENT';
        if (!base.amount || base.amount === '') base.amount = String(cb.toFixed(2));
      } else if (cb < 0) {
        // Client owes Owners2 → Client Payment
        base.entryType = 'CLIENT_PAYMENT';
        if (!base.amount || base.amount === '') base.amount = String(cb.toFixed(2));
      }
      if (!base.paymentMethod) base.paymentMethod = 'Transfer';
    }
    // Default reference based on yymm when period known
    if (!base.reference) {
      const yymm = (typeof yearMonth === 'string' && /^\d{4}-\d{2}$/.test(yearMonth))
        ? yearMonth.slice(2).replace('-', '')
        : '';
      if (yymm) base.reference = `Pago reporte ${yymm}`;
    }
    return base;
  });
  // --- Apply one-time presets from parent (e.g., ClientMonthlyReport) ---
  const [appliedPresets, setAppliedPresets] = useState(false);

  useEffect(() => {
    if (appliedPresets) return;

    const hasAnyPreset =
      presetUnitId != null ||
      (presetUnitName && presetUnitName !== '') ||
      (presetDate && presetDate !== '') ||
      (presetEntryType && presetEntryType !== '') ||
      (presetReference && presetReference !== '');

    if (!hasAnyPreset) return;

    setForm(prev => {
      const next = { ...(prev || {}) };

      // --- Unit (normalize to both id + IRI + name) ---
      if (presetUnitId != null) {
        const iri = `/api/units/${String(presetUnitId)}`;
        next.unit = iri;                 // API IRI (most forms expect this)
        next.unitId = String(presetUnitId);
        if (!next.unitName && presetUnitName) next.unitName = String(presetUnitName);
      }
      if (presetUnitName && !next.unitName) {
        next.unitName = String(presetUnitName);
      }

      // --- Date ---
      if (presetDate) next.date = String(presetDate);

      // --- Entry Type (support both code + human label) ---
      if (presetEntryType) {
        let codeGuess = String(presetEntryType).toUpperCase();
        // Map known human labels to new controller codes
        if (/^O2\s+Report\s+Payment$/i.test(presetEntryType)) codeGuess = 'O2_PAYMENT';
        else if (/^Client\s+Report\s+Payment$/i.test(presetEntryType)) codeGuess = 'CLIENT_PAYMENT';
        // If already a code we support, keep it:
        if (codeGuess !== 'O2_PAYMENT' && codeGuess !== 'CLIENT_PAYMENT') {
          // Fallback heuristic: owners2→client => O2_PAYMENT, else CLIENT_PAYMENT
          codeGuess = (/owners2/i.test(presetEntryType) && /client/i.test(presetEntryType)) ? 'O2_PAYMENT' : 'CLIENT_PAYMENT';
        }
        next.entryType = codeGuess;                 // code used by the backend
        next.type = String(presetEntryType);        // label if your UI binds to this
      }

      // --- Reference ---
      if (presetReference != null) next.reference = String(presetReference);

      return next;
    });

    setAppliedPresets(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // --- end presets ---

  const unitLocked = true; // Unit Monthly Report: unit is always provided by parent context

  const resetForm = () => {
    const merged = mergeDefaults(makeInitialForm(), defaults);
    // Re-apply context unit id/name
    const incomingId = ctxUnitId ?? presetUnitId;
    const incomingName = ctxUnitName ?? presetUnitName;
    if (incomingId != null) {
      merged.unitId = String(incomingId);
      merged.unit = `/api/units/${String(incomingId)}`;
    }
    if (incomingName) merged.unitName = String(incomingName);

    // Apply closingBalance-driven defaults
    const cb = (typeof closingBalance === 'number') ? closingBalance : null;
    if (cb != null) {
      if (cb > 0) {
        merged.entryType = 'O2_PAYMENT';
        merged.amount = String(cb.toFixed(2));
      } else if (cb < 0) {
        merged.entryType = 'CLIENT_PAYMENT';
        merged.amount = String(cb.toFixed(2));
      }
      if (!merged.paymentMethod) merged.paymentMethod = 'Transfer';
    }
    // Reference default from yearMonth (yymm)
    const yymm = (typeof yearMonth === 'string' && /^\d{4}-\d{2}$/.test(yearMonth))
      ? yearMonth.slice(2).replace('-', '')
      : '';
    if (yymm) merged.reference = `Pago reporte ${yymm}`;

    setForm(merged);
  };
  useEffect(() => {
    if (caller !== 'unit-monthly') return;
    const yymm = (typeof yearMonth === 'string' && /^\d{4}-\d{2}$/.test(yearMonth))
      ? yearMonth.slice(2).replace('-', '')
      : '';
    const base = 'Pago reporte';
    setForm(prev => ({ ...prev, reference: yymm ? `${base} ${yymm}` : base }));
  }, [caller, yearMonth]);

  useEffect(() => {
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults]);

  useEffect(() => {
    if (caller === 'confirm-payment' && form.entryType === 'O2_PAYMENT' && requiredAmount != null) {
      const amt = Number(requiredAmount);
      if (!Number.isNaN(amt) && form.amount === '') {
        setForm((prev) => ({ ...prev, amount: String(amt.toFixed(2)) }));
      }
    }
  }, [caller, form.entryType, requiredAmount]);

  const setField = (k, v) => setForm((prev) => {
    let next = { ...prev, [k]: v };

    if (k === 'entryType') {
      if (v === 'O2_PAYMENT' || v === 'CLIENT_PAYMENT') {
        if (!next.paymentMethod) next.paymentMethod = 'Transfer';
        // Default amount from closing balance if empty
        if ((next.amount === '' || next.amount == null) && typeof closingBalance === 'number') {
          next.amount = String(closingBalance.toFixed(2));
        }
      }
    }

    return next;
  });

  // When the user types/selects a unit NAME, map it to the ID if there's an exact match only
  const setUnitName = (name) => {
    setForm((prev) => {
      const q = norm(name);
      if (!q) return { ...prev, unitName: '', unitId: '' };
      const exact = units.find((u) => norm(u.label) === q); // label is unitName
      return {
        ...prev,
        unitName: name,
        unitId: exact ? String(exact.id) : '',
      };
    });
  };

  useEffect(() => {
    let cancelled = false;
    async function loadUnits() {
      setUnitsLoading(true);
      setUnitsError(null);
      try {
        const res = await api.get('/api/units?pagination=false');
        const data = res.data;
        const list = Array.isArray(data)
          ? data
          : (data['hydra:member'] || data.member || data.items || []);
        const normalized = list
          .filter(u => u && (u.id != null))
          .map((u) => ({
            id: u.id,
            label: u.unitName || `Unit ${u.id}`,
            status: u.status || 'Active',
          }));
        const activeOnly = normalized.filter(u => String(u.status).toUpperCase() === 'ACTIVE');
        if (!cancelled) setUnits(activeOnly);
      } catch (e) {
        if (!cancelled) setUnitsError(e.message || String(e));
      } finally {
        if (!cancelled) setUnitsLoading(false);
      }
    }
    loadUnits();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const normalizedAmountStr = (form.amount ?? '').toString().replace(',', '.').trim();
      const amtNum = normalizedAmountStr === '' ? null : parseFloat(normalizedAmountStr);
      const isPartialFlag = enforcePartialRules && requiredAmount != null && !Number.isNaN(amtNum) && amtNum < Number(requiredAmount);
      const partialSuffix = isPartialFlag ? ' (Parcial)' : '';
      const finalNote = (form.note || '') + partialSuffix;

      const isPaymentType = form.entryType === 'O2_PAYMENT' || form.entryType === 'CLIENT_PAYMENT';
      const method = isPaymentType
        ? (form.paymentMethod ? String(form.paymentMethod) : 'Transfer')
        : null;

      // Build payload for unified register-payment endpoint
      const unitNumericId = form.unitId ? Number(form.unitId) : (ctxUnitId != null ? Number(ctxUnitId) : (presetUnitId != null ? Number(presetUnitId) : null));
      if (!unitNumericId) throw new Error('Unit is required');
      const ym = (typeof yearMonth === 'string' && /^\d{4}-\d{2}$/.test(yearMonth)) ? yearMonth : null;
      if (!ym) throw new Error('Year/Month is required');

      const payPayload = {
        unitId: unitNumericId,
        yearMonth: ym,
        date: form.date ? String(form.date) : null,
        amount: (amtNum == null || Number.isNaN(amtNum)) ? null : Number(amtNum.toFixed(2)),
        paymentMethod: method,                         // 'TRANSFER' | 'CASH' | null
        entryType: form.entryType,
        reference: form.reference || null,
        note: finalNote || null,
        closingBalance: (typeof closingBalance === 'number') ? Number(closingBalance) : null,
      };

      // Attach proof as base64 if provided
      if (paymentFile) {
        try {
          const dataUrl = await fileToDataUrl(paymentFile);
          payPayload.fileBase64 = dataUrl;            // backend accepts data URL or raw base64
          // Set fileName with extension fallback
          const ext = (paymentFile.name && paymentFile.name.includes('.')) ? paymentFile.name.split('.').pop() : 'pdf';
          payPayload.fileName = paymentFile.name || `payment-proof.${ext}`;
        } catch (r) {
          console.warn('Failed to read payment file:', r);
        }
      }

      // Call backend registerPayment endpoint using shared api instance (axios)
      let out = null;
      try {
        const { data } = await api.post('/api/unit-monthly/payment', payPayload);
        out = data;
      } catch (errPost) {
        let msg = 'Failed to register payment';
        try {
          if (errPost?.response?.data) {
            const d = errPost.response.data;
            msg = d?.detail || d?.message || JSON.stringify(d);
          } else if (errPost?.message) {
            msg = errPost.message;
          }
        } catch (_) {}
        console.warn('Register payment failed:', errPost);
        throw new Error(msg);
      }

      resetForm();
      setPaymentFile(null);
      try { window.dispatchEvent(new Event('unit-ledger-refresh')); } catch (_) {}
      // After successful save, route to Unit Balance page
      try { if (typeof onSuccess === 'function') onSuccess(); } catch (_) {}
      navigate('/reports/unit-balance');
    } catch (err) {
      // Rethrow so FormLayout can render the banner + toast
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const amountLocked = caller === 'confirm-payment' && form.entryType === 'O2_PAYMENT';

  return (
    <FormLayoutInline
      title={`Register Payment for ${form?.unitName || presetUnitName || defaults?.unitName || `Unit #${form?.unitId || presetUnitId || ''}`}`}
      onSubmit={handleSubmit}
      submitting={submitting}
      onCancel={() => {
        resetForm();
        if (typeof onCancel === 'function') {
          return onCancel();
        }
        if (caller === 'unit-balance') {
          // Stay on the same page and let the parent drawer close if it listens to onCancel
          try { window.dispatchEvent(new Event('unit-ledger-cancel')); } catch (_) {}
          return;
        }
        try {
          if (canSafeBack()) {
            navigate(-1);
          }
        } catch (_) {}
      }}
      submitLabel="Save Payment"
    >
      {/* Unit Name */}
      <div className="form-row">
        <label>Unit Name *</label>
        <input
          type="text"
          readOnly
          value={(form?.unitName || ctxUnitName || presetUnitName || defaults?.unitName || `Unit #${form?.unitId || ctxUnitId || presetUnitId || ''}`)}
          className="o2-input"
          style={{ background: '#f3f4f6', color: '#374151', cursor: 'not-allowed' }}
          placeholder="Unit locked"
          required
        />
        <input type="hidden" name="unit" value={form?.unit || (ctxUnitId != null ? `/api/units/${ctxUnitId}` : (presetUnitId != null ? `/api/units/${presetUnitId}` : ''))} />
        <input type="hidden" name="unitId" value={form?.unitId || (ctxUnitId != null ? String(ctxUnitId) : (presetUnitId != null ? String(presetUnitId) : ''))} />
      </div>

      <div className="form-row">
        <label>Date *</label>
        <input
          type="date"
          className="o2-input"
          value={form.date}
          onChange={(e) => setField('date', e.target.value)}
          required
        />
      </div>

      <div className="form-row">
        <label>Entry Type</label>
        <select
          className="o2-input"
          value={form.entryType}
          onChange={(e) => setField('entryType', e.target.value)}
        >
          <option value="O2_PAYMENT">O2 Payment</option>
          <option value="CLIENT_PAYMENT">Client Payment</option>
        </select>
      </div>



      <div className="form-row">
        <label>Amount *</label>
        <input
          type="number"
          className="o2-input"
          step="0.01"
          value={form.amount}
          onChange={(e) => amountLocked ? null : setField('amount', e.target.value)}
          readOnly={amountLocked}
          disabled={amountLocked}
          style={amountLocked ? { background: '#f3f4f6', color: '#374151' } : undefined}
          required
        />
      </div>

      <div className="form-row">
        <label>Payment Method</label>
        <select
          className="o2-input"
          value={form.paymentMethod || 'Transfer'}
          onChange={(e) => setField('paymentMethod', e.target.value)}
        >
          <option value="Transfer">Transfer</option>
          <option value="Cash">Cash</option>
        </select>
      </div>

      <div className="form-row">
        <label>Reference</label>
        <input
          type="text"
          className="o2-input"
          value={form.reference}
          onChange={(e) => setField('reference', e.target.value)}
          placeholder="e.g. Transfer ID / Receipt #"
        />
      </div>

      <div className="form-row">
        <label>Note</label>
        <textarea
          className="o2-input"
          rows={3}
          value={form.note}
          onChange={(e) => setField('note', e.target.value)}
          placeholder="Additional context for this ledger movement"
        />
      </div>

      {/* Payment proof (optional) */}
      <div className="form-row">
        <label>Payment Proof (PDF or image)</label>
        <input
          type="file"
          className="o2-input"
          accept="application/pdf,image/*"
          onChange={(e) => {
            const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
            setFileError("");
            if (!f) { setPaymentFile(null); return; }
            if (f.size > MAX_FILE_BYTES) {
              setPaymentFile(null);
              setFileError(`File is too large. Max ${Math.round(MAX_FILE_BYTES/1024)} KB.`);
              return;
            }
            setPaymentFile(f);
          }}
        />
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          Optional: attach the transfer receipt or payment slip. Max one file.
        </p>
        {fileError ? (
          <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>{fileError}</p>
        ) : null}
      </div>


      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={() => {
          resetForm();
          if (typeof onCancel === 'function') {
            return onCancel();
          }
          if (caller === 'unit-balance') {
            try { window.dispatchEvent(new Event('unit-ledger-cancel')); } catch (_) {}
            return;
          }
          try {
            if (canSafeBack()) {
              navigate(-1);
            }
          } catch (_) {}
        }}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={submitting}
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </FormLayoutInline>
  );
}