import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useNavigate } from 'react-router-dom';
import FormLayout from '../layouts/FormLayout';

const NewUnitTransactionForm = ({ onSave, onClose, onCancel, stayOnPage = false }) => {
  const [units, setUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedUnitDetails, setSelectedUnitDetails] = useState(null);

  const initialFormData = {
    date: new Date().toISOString().split('T')[0],
    unit: '',
    amount: '',
    category: '',
    description: '',
    type: '',
    comments: '',
    costCenter: 'Client',
    document: null,
    document2: null,
  };

  const [formData, setFormData] = useState(initialFormData);

  const resetForm = () => {
    setSelectedUnitDetails(null);
    setFormData({
      ...initialFormData,
      date: new Date().toISOString().split('T')[0], // ensure fresh date on reset
    });
  };

  const serviceDescriptions = ['Aguakan', 'CFE', 'HOA', 'Internet'];
  const navigate = useNavigate();

  const goBackSmart = () => {
    navigate('/unit-transactions');
  };

  useEffect(() => {
    api.get('/api/units?pagination=false')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : res.data.member || [];
        setUnits(data);
      })
      .catch(err => console.error('Error loading units:', err));

    api.get('/api/transaction_categories')
      .then(res => {
        const flatData = Array.isArray(res.data)
          ? res.data.flat()
          : res.data.member || res.data['hydra:member'] || [];
        const list = flatData.map((c) => {
          const id = c.id ?? parseInt((c['@id'] || '').split('/').pop(), 10);
          let t = c.type || '';
          if (t === 'income') t = 'Ingreso';
          if (t === 'expense') t = 'Gasto';
          if (t === 'both') t = 'Both';
          return {
            id,
            name: c.name || c.categoryName || '',
            type: t, // 'Ingreso' | 'Gasto' | 'Both'
            allowUnit: c.allowUnit === true || c.allow_unit === 1 || c.allow_unit === true,
          };
        }).filter(c => c.allowUnit);
        setCategories(list.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(err => console.error('Error loading categories:', err));
  }, []);

  // Fetch full unit details (includes hoaAmount, internetCost, etc.) when a unit is selected
  useEffect(() => {
    const unitId = formData.unit;
    if (!unitId || String(unitId).trim() === '') {
      setSelectedUnitDetails(null);
      return;
    }
    // Only fetch when it's an ID (not a name typed in the datalist before selection maps to id)
    if (!/^\d+$/.test(String(unitId))) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/api/units/${unitId}`);
        if (!cancelled) setSelectedUnitDetails(res?.data || null);
      } catch (e) {
        if (!cancelled) setSelectedUnitDetails(null);
      }
    })();
    return () => { cancelled = true; };
  }, [formData.unit]);

  const activeUnits = units.filter(u => u && u.status && u.status.toUpperCase() === 'ACTIVE');

  // Auto-fill Amount from selected unit details for service payments (HOA / Internet)
  // Preserves user edits: only sets when Amount is empty.
  useEffect(() => {
    try {
      const isAmountEmpty = String(formData.amount ?? '').trim() === '';
      if (!isAmountEmpty) return;

      const selectedCategory = categories.find(c => String(c.id) === String(formData.category));
      const isPagoServicios = (selectedCategory?.name || '').toLowerCase() === 'pago de servicios';
      if (!isPagoServicios) return;

      const desc = (formData.description || '').toLowerCase();
      if (!selectedUnitDetails) return;

      let candidate = null;
      if (desc === 'hoa') {
        candidate = selectedUnitDetails.hoaAmount ?? selectedUnitDetails.hoa_amount;
      } else if (desc === 'internet') {
        candidate = selectedUnitDetails.internetCost ?? selectedUnitDetails.internet_cost;
      }
      if (candidate == null || candidate === '') return;

      const num = Number(candidate);
      if (!Number.isFinite(num) || num <= 0) return;

      setFormData(prev => ({
        ...prev,
        amount: num.toFixed(2),
      }));
    } catch (e) {
      // silent fail
    }
  }, [formData.amount, formData.category, formData.description, categories, selectedUnitDetails]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'category') {
      const selectedCategory = categories.find(c => c.id.toString() === value);
      const selectedType = selectedCategory ? selectedCategory.type : '';
      setFormData(prev => ({
        ...prev,
        category: value,
        type: selectedType === 'Both' ? (prev.type === 'Gasto' ? 'Gasto' : 'Ingreso') : selectedType,
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Normalize decimal separator for amount: allow "1234,56" and convert to "1234.56"
    const normalizedAmountStr = (formData.amount ?? '').toString().replace(',', '.').trim();

    // Basic validations -> throw so FormLayout can render the banner + toast
    if (!formData.date) {
      throw new Error('Date is required.');
    }
    if (!formData.unit || !/^\d+$/.test(String(formData.unit))) {
      throw new Error('Please select a valid Unit from the list.');
    }
    if (!formData.category) {
      throw new Error('Please select a Category.');
    }
    if (!formData.type) {
      throw new Error('Type is required.');
    }
    if (normalizedAmountStr === '' || !Number.isFinite(parseFloat(normalizedAmountStr))) {
      throw new Error('Amount is required.');
    }

    const formPayload = {
      date: formData.date,
      unit: `/api/units/${formData.unit}`,
      amount: String(parseFloat(normalizedAmountStr).toFixed(2)),
      category: `/api/transaction_categories/${formData.category}`,
      description: formData.description,
      type: formData.type,
      comments: formData.comments,
      costCenter: 'Client',
    };

    try {
      const transactionRes = await api.post('/api/unit_transactions', formPayload);
      const transactionId = transactionRes.data.id;

      const uploadOne = async (file) => {
        if (!file) return;
        const docFormData = new FormData();
        docFormData.append('unit', formData.unit);
        docFormData.append('description', formData.description);
        docFormData.append('transaction', transactionId);
        docFormData.append('transactionType', 'unit');
        docFormData.append('document', file);
        try {
          await api.post('/api/unit-documents/upload', docFormData, { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch (uploadErr) {
          console.error('Document upload failed:', uploadErr);
        }
      };

      await uploadOne(formData.document);
      await uploadOne(formData.document2);

      // Notify parent if needed, then navigate back (FormLayout will handle toast globally)
      try { onSave?.(transactionRes.data); } catch {}
      try { onClose?.(); } catch {}
      goBackSmart();
      return transactionRes;
    } catch (err) {
      console.error('Submission failed:', err);
      const apiMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        (typeof err?.response?.data === 'string' ? err.response.data : null) ||
        err?.message ||
        'Failed to create unit transaction.';
      // Let FormLayout show the error banner + toast by rethrowing a clean Error
      throw new Error(apiMessage);
    }
  };

  return (
    <FormLayout title="New Unit Transaction" onSubmit={handleSubmit} style={{ maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
        <div className="form-row">
          <label>Date</label>
          <input type="date" name="date" value={formData.date} onChange={handleChange} required />
        </div>

        <div className="form-row">
          <label>Unit</label>
          <input
            type="text"
            list="units"
            name="unit"
            value={
              activeUnits.find((u) => u.id.toString() === formData.unit)?.unitName || formData.unit
            }
            onChange={(e) => {
              const selected = activeUnits.find((u) => u.unitName === e.target.value);
              setFormData((prev) => ({ ...prev, unit: selected ? selected.id.toString() : e.target.value }));
            }}
            required
          />
          <datalist id="units">
            {activeUnits.map((u) => (
              <option key={u.id} value={u.unitName} />
            ))}
          </datalist>
        </div>

        <div className="form-row">
          <label>Category</label>
          <select name="category" value={formData.category} onChange={handleChange} required>
            <option value="">Select Category</option>
            {Array.isArray(categories) &&
              categories.map((cat) => (
                <option key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </option>
              ))}
          </select>
        </div>

        <div className="form-row">
          <label>Type</label>
          {(() => {
            const cat = categories.find(c => c.id.toString() === formData.category);
            if (cat && cat.type === 'Both') {
              return (
                <select name="type" value={formData.type} onChange={handleChange} required>
                  <option value="Ingreso">Ingreso</option>
                  <option value="Gasto">Gasto</option>
                </select>
              );
            }
            return (
              <input type="text" name="type" value={formData.type} readOnly />
            );
          })()}
        </div>

        <div className="form-row">
          <label>Description</label>
          {formData.category && categories.find(c => c.id.toString() === formData.category)?.name === 'Pago de Servicios' ? (
            <select name="description" value={formData.description} onChange={handleChange}>
              <option value="">Select Description</option>
              {serviceDescriptions.sort().map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          ) : (
            <input type="text" name="description" value={formData.description} onChange={handleChange} />
          )}
        </div>

        <div className="form-row">
          <label>Amount</label>
          <input type="number" step="0.01" name="amount" value={formData.amount} onChange={handleChange} required />
        </div>

        <div className="form-row">
          <label>Comments</label>
          <textarea name="comments" value={formData.comments} onChange={handleChange}></textarea>
        </div>

        <div className="form-row">
          <label>Upload Document (PDF or JPEG)</label>
          <input
            type="file"
            name="document"
            accept=".pdf, .jpg, .jpeg"
            onChange={(e) => setFormData(prev => ({ ...prev, document: e.target.files[0] }))}
          />
        </div>

        <div className="form-row">
          <label>Upload Document 2 (PDF or JPEG)</label>
          <input
            type="file"
            name="document2"
            accept=".pdf, .jpg, .jpeg"
            onChange={(e) => setFormData(prev => ({ ...prev, document2: e.target.files[0] }))}
          />
        </div>

        <div className="form-row">
          <label>Cost Center</label>
          <select name="costCenter" value="Client" disabled>
            <option value="Owners2">Owners2</option>
            <option value="Housekeepers">Housekeepers</option>
            <option value="Guest">Guest</option>
            <option value="Client">Client</option>
          </select>
        </div>

        <div className="form-actions">
          <div className="form-actions-left">
            <button type="submit" className="btn btn-primary">Save</button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                resetForm();
                try { onCancel?.(); } catch {}
                try { onClose?.(); } catch {}
                goBackSmart(); // always go back on cancel
              }}
            >
              Cancel
            </button>
          </div>
          {/* No .form-actions-right (Delete) for a NEW form */}
        </div>
      </div>
    </FormLayout>
  );
};

export default NewUnitTransactionForm;