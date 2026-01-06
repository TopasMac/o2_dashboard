import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FormLayout from '../layouts/FormLayout';
import api from '../../api';
import '../layouts/Buttons.css';

// Reads JWT from localStorage and returns { Authorization: 'Bearer <token>' } or {}
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

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
    entryType: 'REPORT_POSTING',
    amount: '',
    paymentMethod: '',
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
  // NEW optional presets (applied only if provided)
  presetUnitId,
  presetUnitName,
  presetDate,
  presetEntryType,
  presetReference,
  lockUnit = false,
}) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  // Optional attachment
  const [attachment, setAttachment] = useState(null);

  // Units for dropdown
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState(null);

  // For confirm-payment: allow choosing between Full vs Partial transfer while keeping the same entryType
  const [isPartial, setIsPartial] = useState(false);

  const [form, setForm] = useState(() => {
    const base = mergeDefaults(makeInitialForm(), defaults);
    if (caller === 'confirm-payment') {
      // Default to Owners2 Transfer and Transfer method
      if (!base.entryType || base.entryType === 'REPORT_POSTING') base.entryType = 'PAYMENT_TO_CLIENT';
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
        // Use known code for Owners2 → Client transfer; keep the human label too
        const codeGuess =
          /owners2/i.test(presetEntryType) && /client/i.test(presetEntryType)
            ? 'PAYMENT_TO_CLIENT'
            : presetEntryType;
        next.entryType = String(codeGuess);          // code used by the backend
        next.type = String(presetEntryType);         // label if your UI binds to this
      }
  
      // --- Reference ---
      if (presetReference != null) next.reference = String(presetReference);
  
      return next;
    });
  
    setAppliedPresets(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // --- end presets ---
  useEffect(() => {
    if (caller === 'confirm-payment') setIsPartial(false);
  }, [caller]);

  const unitLocked = Boolean((defaults && defaults.unitId) || lockUnit) || caller === 'confirm-payment';

  const resetForm = () => {
    const merged = mergeDefaults(makeInitialForm(), defaults);
    if (caller === 'confirm-payment') {
      if (!merged.entryType || merged.entryType === 'REPORT_POSTING') merged.entryType = 'PAYMENT_TO_CLIENT';
      if (!merged.paymentMethod) merged.paymentMethod = 'Transfer';
      if (requiredAmount != null) {
        const amt = Number(requiredAmount);
        if (!Number.isNaN(amt)) merged.amount = String(amt.toFixed(2));
      }
    }
    if (caller === 'unit-balance') {
      if (!merged.paymentMethod) merged.paymentMethod = 'Transfer';
    }
    setForm(merged);
    setAttachment(null);
    setIsPartial(false);
  };

  useEffect(() => {
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults]);

  useEffect(() => {
    if (caller === 'confirm-payment' && form.entryType === 'PAYMENT_TO_CLIENT' && requiredAmount != null) {
      const amt = Number(requiredAmount);
      if (!Number.isNaN(amt) && form.amount === '') {
        setForm((prev) => ({ ...prev, amount: String(amt.toFixed(2)) }));
      }
    }
  }, [caller, form.entryType, requiredAmount, form.amount]);

  const setField = (k, v) => setForm((prev) => {
    let next = { ...prev, [k]: v };

    if (k === 'entryType') {
      if (caller === 'confirm-payment' && v === 'PAYMENT_TO_CLIENT') {
        setIsPartial(false);
        if (requiredAmount != null) {
          const amt = Number(requiredAmount);
          if (!Number.isNaN(amt)) next.amount = String(amt.toFixed(2));
        }
      } else if (prev.entryType === 'PAYMENT_TO_CLIENT') {
        // Leaving Owners2 Transfer: clear amount and reset partial
        setIsPartial(false);
        next.amount = '';
      }
      // When switching into a payment type, ensure a default payment method
      if ((v === 'PAYMENT_TO_CLIENT' || v === 'PAYMENT_FROM_CLIENT') && !next.paymentMethod) {
        next.paymentMethod = 'Transfer';
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

      const isPaymentType = form.entryType === 'PAYMENT_TO_CLIENT' || form.entryType === 'PAYMENT_FROM_CLIENT';
      const method = isPaymentType
        ? (form.paymentMethod ? String(form.paymentMethod).toUpperCase() : 'TRANSFER')
        : null;

      const payload = {
        unit: form.unit || (form.unitId ? `/api/units/${String(form.unitId)}` : null),
        date: form.date ? form.date : null,
        entryType: form.entryType,
        amount: amtNum == null || Number.isNaN(amtNum) ? null : String(amtNum.toFixed(2)),
        paymentMethod: method,
        reference: form.reference || null,
        note: finalNote || null,
      };

      // Basic client-side validation -> throw so FormLayout shows banner + toast
      if (!payload.unit) throw new Error('Unit is required');
      if (!payload.amount) throw new Error('Amount is required');

      const res = await fetch('/api/unit_balance_ledgers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.warn('Create ledger failed:', txt);
        // Prefer JSON error if available
        let msg = txt || 'Failed to create ledger row';
        try {
          const parsed = JSON.parse(txt);
          msg = parsed?.detail || parsed?.message || msg;
        } catch (_) {}
        throw new Error(msg);
      }

      let created;
      try {
        created = await res.json();
      } catch (_) {
        created = null;
      }
      const iri = created && (created['@id'] || created.id || created.iri);
      let ledgerId = null;
      if (typeof iri === 'string') {
        const m = iri.match(/\/(\d+)(?:$|\b)/);
        if (m) ledgerId = m[1];
      }
      if (!ledgerId && created && created.id) {
        ledgerId = String(created.id);
      }

      if (attachment && ledgerId) {
        const fd = new FormData();
        fd.append('file', attachment);
        if (form.date) fd.append('dateForName', form.date);
        fd.append('category', 'PAYMENT_PROOF');
        fd.append('description', 'Comprobante de pago');

        const up = await fetch(`/api/unit_balance_ledgers/${ledgerId}/upload-proof`, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
          },
          body: fd,
        });
        if (!up.ok) {
          const t = await up.text();
          console.warn('Attachment upload failed:', t);
          // Non-fatal: proceed without throwing
        }
      }

      resetForm();
      try { window.dispatchEvent(new Event('unit-ledger-refresh')); } catch (_) {}
      if (typeof onSuccess === 'function') {
        onSuccess();
      } else {
        navigate('/unit-balance?refresh=' + Date.now());
      }
    } catch (err) {
      // Rethrow so FormLayout can render the banner + toast
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const amountLocked = caller === 'confirm-payment' && form.entryType === 'PAYMENT_TO_CLIENT' && !isPartial;

  return (
    <FormLayout
      title="New Unit Balance Ledger Entry"
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
        navigate(-1);
      }}
      submitLabel="Save Entry"
    >
     {/* Unit Name */}
{unitLocked ? (
  <div className="form-field">
    <label>Unit Name *</label>
    <input
      type="text"
      readOnly
      value={(form?.unitName || presetUnitName || defaults?.unitName || `Unit #${form?.unitId || presetUnitId || ''}`)}
      className="o2-input"
      style={{ background: '#f3f4f6', color: '#374151', cursor: 'not-allowed' }}
      placeholder="Unit locked"
      required
    />
    {/* Hidden fields to keep API payload stable */}
    <input
      type="hidden"
      name="unit"
      value={form?.unit || (presetUnitId != null ? `/api/units/${presetUnitId}` : '')}
    />
    <input
      type="hidden"
      name="unitId"
      value={form?.unitId || (presetUnitId != null ? String(presetUnitId) : '')}
    />
    <p style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
      Unit is locked by the parent context.
    </p>
  </div>
) : (
  <div className="form-field">
    <label>Unit Name *</label>
    <input
      list="units-list"
      value={form.unitName}
      onChange={(e) => setUnitName(e.target.value)}
      onBlur={(e) => setUnitName(e.target.value)}
      required
      placeholder={unitsLoading ? 'Loading units…' : 'Type or select unit name'}
    />
    <datalist id="units-list">
      {units.map((u) => (
        <option key={u.id} value={u.label} />
      ))}
    </datalist>
    {unitsError && (
      <p style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>
        {unitsError}
      </p>
    )}
    {form.unitName && !unitsLoading && !form.unitId && (
      <p style={{ color: '#92400e', fontSize: 12, marginTop: 4 }}>
        Pick an option from the list to confirm the unit.
      </p>
    )}
  </div>
)}

      <div className="form-field">
        <label>Date *</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setField('date', e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label>Entry Type</label>
        <select
          value={form.entryType}
          onChange={(e) => setField('entryType', e.target.value)}
        >
          {caller !== 'confirm-payment' && (
            <option value="REPORT_POSTING">Report Posting — result from the unit's month report</option>
          )}
          <option value="PAYMENT_TO_CLIENT">Owners2 Transfer — transfer to client</option>
          {caller !== 'confirm-payment' && (
            <option value="PAYMENT_TO_CLIENT">Owners2 Partial Transfer — transfer to client (partial amount)</option>
          )}
          <option value="PAYMENT_FROM_CLIENT">Client Transfer — client pays Owners2</option>
        </select>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          Report Posting can be positive or negative. Owners2 Transfer options balance the month result (partial or full). Client Transfer is used when payment_type = CLIENT or to cover negative balances.
        </p>
      </div>

      {caller === 'confirm-payment' && form.entryType === 'PAYMENT_TO_CLIENT' && (
        <div className="form-field">
          <label>Transfer Type</label>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="transferType"
                checked={!isPartial}
                onChange={() => {
                  setIsPartial(false);
                  if (requiredAmount != null) {
                    const amt = Number(requiredAmount);
                    if (!Number.isNaN(amt)) setForm((prev) => ({ ...prev, amount: String(amt.toFixed(2)) }));
                  }
                }}
              />
              Full (Closing balance)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="transferType"
                checked={isPartial}
                onChange={() => {
                  setIsPartial(true);
                  setForm((prev) => ({ ...prev, amount: '' }));
                }}
              />
              Partial
            </label>
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            Select <em>Partial</em> to enter a different amount. The report will mark it as partial.
          </p>
        </div>
      )}

      <div className="form-field">
        <label>Amount *</label>
        <input
          type="number"
          step="0.01"
          value={form.amount}
          onChange={(e) => amountLocked ? null : setField('amount', e.target.value)}
          readOnly={amountLocked}
          disabled={amountLocked}
          style={amountLocked ? { background: '#f3f4f6', color: '#374151' } : undefined}
          placeholder="e.g. 1500.00 (positive = we owe client)"
          required
          title={amountLocked ? 'Locked to closing balance in Confirm Payment (Full)' : undefined}
        />
      </div>

      {(form.entryType === 'PAYMENT_TO_CLIENT' || form.entryType === 'PAYMENT_FROM_CLIENT') && (
        <div className="form-field">
          <label>Payment Method</label>
          {(caller === 'confirm-payment' || caller === 'unit-balance') ? (
            <select
              value={form.paymentMethod || 'Transfer'}
              onChange={(e) => setField('paymentMethod', e.target.value)}
            >
              <option value="Transfer">Transfer</option>
              <option value="Cash">Cash</option>
            </select>
          ) : (
            <input
              type="text"
              value={form.paymentMethod}
              onChange={(e) => setField('paymentMethod', e.target.value)}
              placeholder="e.g. Transfer, Cash, Wise"
            />
          )}
        </div>
      )}

      <div className="form-field">
        <label>Reference</label>
        <input
          type="text"
          value={form.reference}
          onChange={(e) => setField('reference', e.target.value)}
          placeholder="e.g. Transfer ID / Receipt #"
        />
      </div>

      <div className="form-field">
        <label>Note</label>
        <textarea
          rows={3}
          value={form.note}
          onChange={(e) => setField('note', e.target.value)}
          placeholder="Additional context for this ledger movement"
        />
      </div>

      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
        Sign convention: <strong>positive</strong> means Owners2 owes the client; <strong>negative</strong> means client owes Owners2.
      </p>

      <div className="form-field" style={{ marginTop: 12 }}>
        <label>Attach file (optional)</label>
        <input
          type="file"
          onChange={(e) => setAttachment(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
          accept="image/*,application/pdf"
        />
        {attachment && (
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            Selected: {attachment.name}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={() => {
          resetForm();
          if (typeof onCancel === 'function') {
            return onCancel();
          }
          if (caller === 'unit-balance') {
            try { window.dispatchEvent(new Event('unit-ledger-cancel')); } catch (_) {}
            return;
          }
          navigate(-1);
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
    </FormLayout>
  );
}