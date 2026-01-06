import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import FormLayout from '../layouts/FormLayout';
import api from '../../api';

const isCleaningCategory = (name) => {
  if (!name) return false;
  const n = String(name).toLowerCase().trim().replace(/\s+/g, ' ');
  return n === 'limpieza' || n === 'limpieza_extra' || n === 'limpieza extra';
};

const EditHKTransactionForm = ({ id: propId, onClose, onSave }) => {
  const params = useParams();
  const id = propId || params.id;
  const [formData, setFormData] = useState({
    id: '',
    transactionCode: '',
    date: '',
    unitId: '',
    unitName: '',
    allocationTarget: 'Unit',
    city: '',
    categoryId: '',
    costCentre: '',
    description: '',
    paid: '',
    charged: ''
  });
  const [units, setUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [userEditedCharged, setUserEditedCharged] = useState(false);

  useEffect(() => {
    // Load transaction data
    api.get(`/api/hk-transactions/${id}`)
      .then((res) => {
        const tx = res.data;
        setFormData({
          id: tx.id,
          transactionCode: tx.transactionCode,
          date: tx.date ? tx.date.split('T')[0] : '',
          unitId: tx.unit?.id ? String(tx.unit.id) : '',
          unitName: tx.unit?.unitName || (tx.allocationTarget === 'Housekeepers' ? 'Housekeepers' : ''),
          allocationTarget: tx.allocationTarget || 'Unit',
          city: tx.city || '',
          categoryId: tx.category?.id ? String(tx.category.id) : '',
          categoryName: tx.category?.name || tx.category?.categoryName || '',
          costCentre: tx.costCentre,
          description: tx.description || '',
          paid: tx.paid,
          charged: tx.charged
        });
      })
      .catch((err) => console.error('Error loading transaction:', err));

    // Load units (include Alor status explicitly) and categories for dropdowns/autocomplete
    const normalizeUnits = (payload) => (Array.isArray(payload) ? payload : (payload.member || payload['hydra:member'] || []));

    Promise.all([
      api.get('/api/units?pagination=false'),
      api.get('/api/units?pagination=false&status=Alor'),
    ])
      .then(([allRes, alorRes]) => {
        const allUnits = normalizeUnits(allRes.data);
        const alorUnits = normalizeUnits(alorRes.data);
        // Merge by id (keep unique)
        const byId = new Map();
        [...allUnits, ...alorUnits].forEach((u) => {
          const id = u.id ?? parseInt((u['@id'] || '').split('/').pop(), 10);
          if (id != null && !Number.isNaN(id)) {
            byId.set(String(id), { ...u, id });
          }
        });
        const merged = Array.from(byId.values());
        const hkOption = [{ id: 'HK', unitName: 'Housekeepers', city: 'General' }];
        const sortedUnits = merged.sort((a, b) => (a.unitName || '').localeCompare(b.unitName || ''));
        setUnits([...hkOption, ...sortedUnits]);
      })
      .catch((err) => console.error('Error loading units:', err));

    api.get('/api/transaction_categories')
      .then((res) => {
        const data = res.data;
        const flatCategories = Array.isArray(data)
          ? data
          : data.member || data['hydra:member'] || [];
        const list = flatCategories.map((c) => {
          const id = c.id ?? parseInt((c['@id'] || '').split('/').pop(), 10);
          return {
            id,
            name: c.name || c.categoryName || '',
            allowHk: c.allowHk === true || c.allow_hk === 1 || c.allow_hk === true,
          };
        }).filter(c => c.allowHk);
        setCategories(list.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((err) => console.error('Error loading categories:', err));
  }, [id]);

  useEffect(() => {
    // Auto-sync Charged with Paid for Alor units (until user edits Charged)
    const selUnit = units.find((u) => String(u.id) === String(formData.unitId));
    const isHK = formData.unitName === 'Housekeepers';
    if (!isHK && selUnit?.status === 'Alor' && !userEditedCharged && !isCleaningCategory(formData.categoryName)) {
      setFormData((prev) => ({ ...prev, charged: prev.paid ?? '' }));
    }
  }, [formData.paid, formData.unitId, formData.unitName, units, userEditedCharged]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Basic validations -> throw so FormLayout can catch and render the banner
    if (!formData.date) {
      throw new Error('Date is required.');
    }
    if (!(String(formData.unitId || '') || formData.unitName === 'Housekeepers')) {
      throw new Error('Unit is required.');
    }
    if (!String(formData.categoryId || '').trim()) {
      throw new Error('Category is required.');
    }
    if (!String(formData.costCentre || '').trim()) {
      throw new Error('Cost Centre is required.');
    }

    // Normalize decimal separators for money fields
    const normalizeMoney = (val) => {
      const s = (val ?? '').toString().replace(',', '.').trim();
      if (s === '') return '';
      const n = parseFloat(s);
      return Number.isFinite(n) ? n.toFixed(2) : '';
    };
    const paidNorm = normalizeMoney(formData.paid);
    const chargedNorm = normalizeMoney(formData.charged);
    const payload = {
      ...formData,
      paid: paidNorm === '' ? null : String(paidNorm),
      charged: chargedNorm === '' ? null : String(chargedNorm),
    };

    // Return the promise so FormLayout can await and handle errors globally
    return api.put(`/api/hk-transactions/${id}`, payload)
      .then((res) => {
        try { onSave?.(); } catch {}
        try { onClose?.(); } catch {}
        return res; // important: allow FormLayout to read the id for row highlight
      })
      .catch((error) => {
        console.error('Error updating transaction:', error);
        const apiMessage =
          error?.response?.data?.detail ||
          error?.response?.data?.message ||
          (typeof error?.response?.data === 'string' ? error.response.data : null) ||
          error?.message ||
          'Failed to update transaction';
        // Rethrow so FormLayout.jsx shows the banner + toast
        throw new Error(apiMessage);
      });
  };

  const handleDelete = async () => {
    // Add confirmation prompt before proceeding
    const confirmed = window.confirm("Delete this transaction?");
    if (!confirmed) {
      return;
    }
    if (!formData.id) {
      console.error('No record ID to delete');
      return;
    }
    return api.delete(`/api/hk-transactions/${formData.id}`)
      .then(() => {
        try { onClose?.(); } catch {}
        try { onSave?.(); } catch {}
      })
      .catch((error) => {
        console.error('Error deleting transaction:', error);
        throw error;
      });
  };

  return (
    <FormLayout
      title="Edit HK Transaction"
      onSubmit={handleSubmit}
      moneyFields={['paid', 'charged']}
    >
      <FormLayout.Row label="Transaction Code">
        <input
          type="text"
          name="transactionCode"
          value={formData.transactionCode}
          readOnly
          style={{ backgroundColor: '#e0e0e0' }}
        />
      </FormLayout.Row>
      <FormLayout.Row label="Date">
        <input
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          required
        />
      </FormLayout.Row>
      <FormLayout.Row label="Unit">
        <select
          name="unitId"
          value={String(formData.unitName === 'Housekeepers' ? 'HK' : formData.unitId)}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'HK') {
              setFormData((prev) => {
                const city = prev.city || 'General';
                const mapAT = (c) => c === 'Playa del Carmen' ? 'Housekeepers_Playa' : (c === 'Tulum' ? 'Housekeepers_Tulum' : 'Housekeepers_General');
                const at = mapAT(city);
                return {
                  ...prev,
                  unitId: '',
                  unitName: 'Housekeepers',
                  allocationTarget: at,
                  costCentre: at,
                  city,
                };
              });
              setUserEditedCharged(false);
            } else {
              const selectedUnit = units.find((u) => String(u.id) === value);
              setFormData((prev) => {
                const cleaningFee = selectedUnit ? (selectedUnit.cleaningFee ?? selectedUnit.cleaning_fee ?? 0) : 0;
                const isCleaning = isCleaningCategory(prev.categoryName);
                return {
                  ...prev,
                  unitId: value,
                  unitName: selectedUnit?.unitName || '',
                  allocationTarget: 'Unit',
                  city: selectedUnit?.city || prev.city,
                  costCentre: (selectedUnit?.status === 'Alor') ? 'Client' : prev.costCentre,
                  charged: (!isCleaning && selectedUnit?.status === 'Alor')
                    ? (prev.paid ?? '')
                    : (isCleaning ? cleaningFee : prev.charged)
                };
              });
              setUserEditedCharged(false);
            }
          }}
          required
        >
          <option value="">Select a unit</option>
          {units.map((unit) => (
            <option key={unit.id} value={String(unit.id)}>
              {unit.unitName}
            </option>
          ))}
        </select>
      </FormLayout.Row>
      {formData.unitName === 'Housekeepers' && (
        <FormLayout.Row label="City">
          <select
            name="city"
            value={formData.city}
            onChange={(e) => {
              const value = e.target.value;
              const mapAT = (c) => c === 'Playa del Carmen' ? 'Housekeepers_Playa' : (c === 'Tulum' ? 'Housekeepers_Tulum' : 'Housekeepers_General');
              const at = mapAT(value);
              setFormData((prev) => ({
                ...prev,
                city: value,
                allocationTarget: at,
                costCentre: at,
              }));
            }}
            required
          >
            <option value="">Select</option>
            <option value="Playa del Carmen">Playa del Carmen</option>
            <option value="Tulum">Tulum</option>
            <option value="General">General</option>
          </select>
        </FormLayout.Row>
      )}
      <FormLayout.Row label="Category">
        <select
          name="categoryId"
          value={formData.categoryId}
          onChange={(e) => {
            const id = e.target.value;
            const selectedCategory = categories.find((c) => String(c.id) === String(id));
            const name = selectedCategory ? selectedCategory.name : '';
            const defaults = ['Combustible', 'Otros', 'Nomina', 'Consumibles', 'Lavanderia', 'Productos Limpieza', 'Equipamiento'];
            const selectedUnit = units.find((u) => String(u.id) === String(formData.unitId));
            const cleaningFee = selectedUnit ? (selectedUnit.cleaningFee ?? selectedUnit.cleaning_fee ?? 0) : 0;
            setFormData((prev) => ({
              ...prev,
              categoryId: id,
              categoryName: name,
              costCentre: (() => {
                const selUnit = units.find((u) => String(u.id) === String(prev.unitId));
                // If the selected unit is Alor, preserve/force Client
                if (selUnit?.status === 'Alor') {
                  return prev.costCentre || 'Client';
                }
                // Only when unit is Active AND category is Limpieza → default to Owners2
                if ((selUnit?.status === 'Active') && isCleaningCategory(name)) {
                  return 'Owners2';
                }
                // Category-driven defaults for HK operational buckets
                if (defaults.includes(name)) {
                  return 'Housekeepers';
                }
                return prev.costCentre;
              })(),
              charged: (isCleaningCategory(name) && prev.unitName && prev.unitName !== 'Housekeepers')
                ? cleaningFee
                : prev.charged
            }));
          }}
          required
        >
          <option value="">Select a category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </FormLayout.Row>
      <FormLayout.Row label="Cost Centre">
        <select
          name="costCentre"
          value={formData.costCentre}
          onChange={handleChange}
          required
        >
          <option value="">Select cost centre</option>
          <option value="Client">Client</option>
          <option value="Housekeepers">Housekeepers</option>
          <option value="Owners2">Owners2</option>
        </select>
      </FormLayout.Row>
      <FormLayout.Row label="Description">
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
        />
      </FormLayout.Row>
      <FormLayout.Row label="Paid">
        <input
          type="number"
          name="paid"
          value={formData.paid}
          onChange={handleChange}
        />
      </FormLayout.Row>
      <FormLayout.Row label="Charged">
        <input
          type="number"
          name="charged"
          value={formData.charged}
          onChange={(e) => {
            setUserEditedCharged(true);
            handleChange(e);
          }}
        />
      </FormLayout.Row>
      <div className="form-actions" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
        <div className="form-actions-left" style={{ display: 'flex', gap: '8px' }}>
          <button type="submit" className="btn btn-primary">Save</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
        <div className="form-actions-right">
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </FormLayout>
  );
};

export default EditHKTransactionForm;