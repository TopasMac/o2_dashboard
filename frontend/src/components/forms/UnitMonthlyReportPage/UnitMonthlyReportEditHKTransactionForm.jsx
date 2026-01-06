import React, { useEffect, useMemo, useState } from 'react';
import FormLayoutInline from '../../layouts/FormLayoutInline';
import api from '../../../api';

// Helper to extract ID from IRI, object, or number
const iriToId = (v) => {
  if (!v) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    const parts = v.split('/');
    return parts[parts.length - 1] || '';
  }
  if (typeof v === 'object' && v.id != null) return String(v.id);
  return '';
};

export default function UnitMonthlyReportEditHKTransactionForm({ transactionId, unitName: unitNameProp, onClose }) {
  const [loading, setLoading] = useState(true);
  const [unitName, setUnitName] = useState(unitNameProp || '');
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    paid: '',
    charged: '',
    costCentre: '',
  });

  // Load the HK transaction
  useEffect(() => {
    let active = true;
    async function loadTx() {
      if (!transactionId) return;
      try {
        setLoading(true);
        const { data } = await api.get(`/api/hk-transactions/${transactionId}`);
        if (!active) return;
        setUnitName(unitNameProp || data?.unit?.unitName || data?.unitName || '');
        setFormData({
          category: iriToId(data?.category ?? data?.categoryId ?? data?.category_id),
          description: (data?.description ?? data?.note ?? data?.desc ?? ''),
          paid: (data?.paid != null
            ? String(data.paid)
            : (data?.amount_paid != null
              ? String(data.amount_paid)
              : (data?.paid_amount != null ? String(data.paid_amount) : ''))),
          charged: (data?.charged != null
            ? String(data.charged)
            : (data?.amount_charged != null
              ? String(data.amount_charged)
              : (data?.amount != null ? String(data.amount) : ''))),
          costCentre: (data?.cost_centre ?? data?.costCentre ?? data?.costCentreId ?? ''),
        });
      } catch (e) {
        console.error('Failed to load hktransaction', e);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadTx();
    return () => { active = false; };
  }, [transactionId, unitNameProp]);

  // Load categories (allow_hk = 1), sorted alphabetically
  useEffect(() => {
    let active = true;
    async function loadCats() {
      try {
        const { data } = await api.get('/api/transaction_categories?pagination=false&order[name]=asc');
        const items = Array.isArray(data) ? data : (data['hydra:member'] || []);
        const hkCats = items
          .filter(c => (c.allowHk === true || c.allow_hk === true || c.allow_hk === 1))
          .map(c => ({ id: c.id, name: c.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (active) setCategories(hkCats);
      } catch (e) {
        console.error('Failed to load categories', e);
      }
    }
    loadCats();
    return () => { active = false; };
  }, []);

  const isLimpiezaExtra = useMemo(() => formData.category === '8', [formData.category]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // When "Limpieza Extra" is selected, force default Cost Centre = Client (still editable)
  useEffect(() => {
    if (isLimpiezaExtra && !formData.costCentre) {
      setFormData(prev => ({ ...prev, costCentre: 'Client' }));
    }
  }, [isLimpiezaExtra]);

  const handleSubmit = async () => {
    // Build merge-patch payload
    const normMoney = (v) => {
      const s = (v ?? '').toString().replace(',', '.').trim();
      if (s === '') return undefined; // omit field
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    };

    const payload = {};
    if (formData.category) payload.category = `/api/transaction_categories/${formData.category}`;
    if (formData.description != null) payload.description = formData.description;
    const paidN = normMoney(formData.paid);
    if (paidN !== undefined) payload.paid = paidN;
    const chargedN = normMoney(formData.charged);
    if (chargedN !== undefined) payload.charged = chargedN;
    if (isLimpiezaExtra) {
      payload.cost_centre = formData.costCentre || 'Client';
    }

    await api.put(`/api/hk-transactions/${transactionId}`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (typeof onClose === 'function') onClose();
  };

  const handleDelete = async () => {
    const ok = window.confirm('Delete this housekeeping transaction?');
    if (!ok) return;
    await api.delete(`/api/hk-transactions/${transactionId}`);
    if (typeof onClose === 'function') onClose();
  };

  if (loading) return null;

  return (
    <FormLayoutInline
      title={`Edit Transaction for ${unitName || ''}`}
      onSubmit={(e) => { e?.preventDefault?.(); return handleSubmit(); }}
      onCancel={onClose}
      onDelete={handleDelete}
      renderSave
      showCancel
      mode="edit"
      moneyFields={['paid','charged']}
    >
      {/* Unit Name (read only) */}
      <div className="form-row">
        <label>Unit Name</label>
        <input type="text" value={unitName} readOnly />
      </div>

      {/* Category (allow_hk = 1) */}
      <div className="form-row">
        <label>Category</label>
        <select name="category" value={formData.category} onChange={handleChange}>
          <option value="">Select Category</option>
          {categories.map(cat => (
            <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Cost Centre: only when Limpieza Extra (id=8), default Client but editable */}
      {isLimpiezaExtra && (
        <div className="form-row">
          <label>Cost Centre</label>
          <select name="costCentre" value={formData.costCentre || 'Client'} onChange={handleChange}>
            <option value="Client">Client</option>
            <option value="O2">O2</option>
            <option value="Unit">Unit</option>
          </select>
        </div>
      )}

      {/* Description */}
      <div className="form-row">
        <label>Description</label>
        <input type="text" name="description" value={formData.description} onChange={handleChange} />
      </div>

      {/* Paid */}
      <div className="form-row">
        <label>Paid</label>
        <input type="number" step="0.01" name="paid" value={formData.paid} onChange={handleChange} />
      </div>

      {/* Charged */}
      <div className="form-row">
        <label>Charged</label>
        <input type="number" step="0.01" name="charged" value={formData.charged} onChange={handleChange} />
      </div>
    </FormLayoutInline>
  );
}