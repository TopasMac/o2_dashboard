import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import '../layouts/Buttons.css';
import { toast } from 'react-toastify';

// Small helpers
const toYmd = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  try {
    const dt = new Date(d);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
};

const axiosMessage = (err) => {
  if (err?.response) {
    const status = err.response.status;
    const data = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
    return `${status}: ${data}`;
  }
  return err?.message || 'Network error';
};

export default function EditUnitLedgerForm({ ledgerId, onSuccess }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const [units, setUnits] = useState([]);
  const [form, setForm] = useState({
    unitId: '',
    date: '',
    entryType: 'REPORT_POSTING',
    amount: '',
    paymentMethod: '',
    reference: '',
    note: '',
  });

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  // Fetch units for dropdown
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/units?pagination=false');
        const items = Array.isArray(data['member'])
          ? data['member']
          : Array.isArray(data['hydra:member'])
          ? data['hydra:member']
          : Array.isArray(data)
          ? data
          : [];
        setUnits(items);
      } catch (e) {
        console.error('Failed to load units', e);
      }
    })();
  }, []);

  // Load existing ledger entry
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        if (!ledgerId) return;
        const { data: it } = await api.get(`/api/unit_balance_ledgers/${ledgerId}`);
        if (!isMounted) return;
        setForm({
          unitId: (() => {
            const iri = (typeof it.unit === 'string')
              ? it.unit
              : (it.unit && typeof it.unit['@id'] === 'string')
              ? it.unit['@id']
              : null;
            if (iri && iri.startsWith('/api/units/')) {
              return String(iri.split('/').pop());
            }
            return String(it.unit?.id ?? '');
          })(),
          date: toYmd(it.date),
          entryType: it.entryType || 'REPORT_POSTING',
          amount: it.amount ?? '',
          paymentMethod: it.paymentMethod ?? '',
          reference: it.reference ?? '',
          note: it.note ?? '',
        });
        setLoading(false);
      } catch (e) {
        console.error(e);
        setError(`Could not load the entry. ${axiosMessage(e)}`);
        setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [ledgerId]);

  const unitOptions = useMemo(() => (units || []).map(u => ({ id: u.id, name: u.unitName || u.unit_name || `Unit #${u.id}` })), [units]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      // Normalize decimal separator: allow "8094,72" and convert to "8094.72"
      const normalizedAmountStr = (form.amount ?? '').toString().replace(',', '.').trim();

      const payload = {
        unit: form.unitId ? `/api/units/${Number(form.unitId)}` : null,
        date: form.date || null,
        entryType: form.entryType,
        amount: normalizedAmountStr === '' ? null : String(parseFloat(normalizedAmountStr).toFixed(2)),
        paymentMethod: form.paymentMethod || null,
        reference: form.reference || null,
        note: form.note || null,
      };

      // PATCH merge
      await api.patch(
        `/api/unit_balance_ledgers/${ledgerId}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/merge-patch+json',
            'Accept': 'application/ld+json, application/json'
          }
        }
      );

      try { window.dispatchEvent(new Event('unit-ledger-refresh')); } catch (e) {}
      if (typeof onSuccess === 'function') {
        onSuccess(); // close drawer
      } else {
        navigate('/unit-balance?refresh=' + Date.now());
      }
    } catch (err) {
      console.error(err);
      const msg = axiosMessage(err);
      setError(msg);
      try { toast.error(msg, { autoClose: 1500 }); } catch {}
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!ledgerId) return;
    const ok = window.confirm('Delete this entry? This cannot be undone.');
    if (!ok) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/api/unit_balance_ledgers/${ledgerId}`);
      try { window.dispatchEvent(new Event('unit-ledger-refresh')); } catch (e) {}
      try { window.dispatchEvent(new Event('report-deleted')); } catch (e) {}
      if (typeof onSuccess === 'function') {
        onSuccess(); // close drawer
      } else {
        navigate('/unit-balance?refresh=' + Date.now());
      }
    } catch (err) {
      console.error(err);
      const msg = axiosMessage(err);
      setError(msg);
      try { toast.error(msg, { autoClose: 1500 }); } catch {}
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div style={{ padding: 12 }}>Loading…</div>;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Unit Name dropdown */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>Unit Name</span>
        <select
          value={form.unitId}
          onChange={(e) => setField('unitId', e.target.value)}
          required
        >
          <option value="">— Select Unit —</option>
          {unitOptions.map((u) => (
            <option key={u.id} value={String(u.id)}>{u.name}</option>
          ))}
        </select>
      </label>

      {/* Date */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>Date</span>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setField('date', e.target.value)}
          required
        />
      </label>

      {/* Type */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>Entry Type</span>
        <select
          value={form.entryType}
          onChange={(e) => setField('entryType', e.target.value)}
        >
          <option value="REPORT_POSTING">Report Posting</option>
          <option value="PAYMENT_TO_CLIENT">Payment to Client</option>
          <option value="PAYMENT_FROM_CLIENT">Payment from Client</option>
        </select>
      </label>

      {/* Amount */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>Amount</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={form.amount}
          onChange={(e) => setField('amount', e.target.value)}
          placeholder="0.00"
          required
        />
      </label>

      {/* Payment Method */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>Payment Method</span>
        <input
          type="text"
          value={form.paymentMethod}
          onChange={(e) => setField('paymentMethod', e.target.value)}
          placeholder="e.g., Transfer, Cash"
        />
      </label>

      {/* Reference */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>Reference</span>
        <input
          type="text"
          value={form.reference}
          onChange={(e) => setField('reference', e.target.value)}
          placeholder="Reference / Folio"
        />
      </label>

      {/* Note */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>Note</span>
        <textarea
          rows={4}
          value={form.note}
          onChange={(e) => setField('note', e.target.value)}
          placeholder="Optional notes"
        />
      </label>

      {error && (
        <div className="form-error" role="alert">{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete Entry'}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-secondary" onClick={() => (typeof onSuccess === 'function' ? onSuccess() : navigate(-1))}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
