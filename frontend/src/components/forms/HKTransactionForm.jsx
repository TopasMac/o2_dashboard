import React, { useState, useEffect } from 'react';
import FormLayout from '../layouts/FormLayout';
import api from '../../api';
import { toast } from 'react-toastify';

// Helper to detect Limpieza or Limpieza_extra category
const isCleaningCategory = (name) => {
  if (!name) return false;
  const n = String(name).toLowerCase().trim().replace(/\s+/g, ' ');
  return n === 'limpieza' || n === 'limpieza_extra' || n === 'limpieza extra';
};

const HKTransactionForm = ({ onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    unitId: '',
    unitName: '',
    allocationTarget: 'Unit',
    allocateTo: '',
    city: '',
    categoryId: '',
    categoryName: '',
    costCentre: '',
    description: '',
    paid: '',
    charged: ''
  });
  const [files, setFiles] = useState([]);
  const [units, setUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const costCentres = ['Client', 'Housekeepers', 'Owners2'].sort();
  const [userEditedCharged, setUserEditedCharged] = useState(false);
  const [pendingRows, setPendingRows] = useState([]); // rows added via "Add Another" before final Save

  useEffect(() => {
    // Fetch ALL pages of units (Hydra pagination), then filter to Active/Alor (+ Housekeepers)
    async function fetchAllUnits() {
      let url = '/api/units?pagination=false';
      let all = [];
      try {
        while (url) {
          const res = await api.get(url);
          const pageItems = Array.isArray(res.data)
            ? res.data
            : res.data.member || res.data['hydra:member'] || [];
          all = all.concat(pageItems);
          const view = res.data.view || res.data['hydra:view'];
          const next = view && (view.next || view['hydra:next']);
          url = next || null;
        }
        // filter to include only Active or Alor status, keep Housekeepers
        let unitList = all.filter((u) => u.status === 'Active' || u.status === 'Alor' || u.unitName === 'Housekeepers');
        const hkUnitIndex = unitList.findIndex((u) => u.unitName === 'Housekeepers');
        if (hkUnitIndex > -1) {
          const [hkUnit] = unitList.splice(hkUnitIndex, 1);
          const sortedUnits = unitList.sort((a, b) => a.unitName.localeCompare(b.unitName));
          setUnits([hkUnit, ...sortedUnits]);
        } else {
          setUnits(unitList.sort((a, b) => a.unitName.localeCompare(b.unitName)));
        }
      } catch (e) {
        console.error('Failed to fetch units', e);
        setUnits([]);
      }
    }
    fetchAllUnits();

    api.get('/api/transaction_categories')
      .then(res => {
        const flatData = Array.isArray(res.data)
          ? res.data.flat()
          : res.data.member || res.data['hydra:member'] || [];
        const list = flatData.map((c) => {
          const id = c.id ?? parseInt((c['@id'] || '').split('/').pop(), 10);
          return {
            id,
            name: c.name || c.categoryName || '',
            allowHk: c.allowHk === true || c.allow_hk === 1 || c.allow_hk === true,
          };
        }).filter(c => c.allowHk);
        setCategories(list.sort((a, b) => a.name.localeCompare(b.name)));
      });
  }, []);

  useEffect(() => {
    // Auto-sync Charged with Paid for Alor units (until user edits Charged)
    const selectedUnit = units.find((u) => u.unitName === formData.unitName);
    const isHK = formData.unitName === 'Housekeepers';
    if (
      !isHK &&
      selectedUnit?.status === 'Alor' &&
      !userEditedCharged &&
      !isCleaningCategory(formData.categoryName)
    ) {
      setFormData((prev) => ({ ...prev, charged: prev.paid ?? '' }));
    }
  }, [formData.paid, formData.unitName, units, userEditedCharged]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const buildPayloadFromForm = (fd) => {
    const normalizedPaidStr = (fd.paid ?? '').toString().replace(',', '.').trim();
    const normalizedChargedStr = (fd.charged ?? '').toString().replace(',', '.').trim();
    return {
      date: fd.date,
      unitId: fd.unitId,
      city: fd.unitName === 'Housekeepers' ? fd.city : fd.city,
      categoryId: fd.categoryId,
      costCentre: fd.costCentre,
      description: fd.description,
      paid: normalizedPaidStr === '' ? null : String(parseFloat(normalizedPaidStr).toFixed(2)),
      charged: normalizedChargedStr === '' ? null : String(parseFloat(normalizedChargedStr).toFixed(2)),
      allocationTarget: fd.unitName === 'Housekeepers' ? (fd.allocationTarget || 'Housekeepers_General') : 'Unit',
    };
  };

  const handleSubmit = async (e, addAnother = false) => {
    e.preventDefault();

    // Minimal validation: require unit, category
    if (!formData.unitId && formData.unitName !== 'Housekeepers') {
      const msg = 'Please select a Unit.';
      // When saving via form submit, let FormLayout render the banner+toast by throwing.
      // When adding another row (handled by the Add Another button), we show a toast locally.
      if (addAnother) {
        try { toast.error(msg, { autoClose: 1200 }); } catch {}
        return;
      }
      throw new Error(msg);
    }
    if (!formData.categoryId) {
      const msg = 'Please select a Category.';
      if (addAnother) {
        try { toast.error(msg, { autoClose: 1200 }); } catch {}
        return;
      }
      throw new Error(msg);
    }

    const payload = buildPayloadFromForm(formData);

    if (addAnother) {
      // Queue current row and reset fields, keeping previous queued rows intact
      setPendingRows((prev) => [...prev, payload]);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        unitId: '',
        unitName: '',
        allocationTarget: 'Unit',
        allocateTo: '',
        city: '',
        categoryId: '',
        categoryName: '',
        costCentre: '',
        description: '',
        paid: '',
        charged: ''
      });
      setFiles([]);
      setUserEditedCharged(false);
      return;
    }

    // FINAL SAVE: send all queued rows + current row in one go
    const batch = pendingRows.length ? [...pendingRows, payload] : [payload];

    try {
      const results = [];
      for (const row of batch) {
        const createRes = await api.post('/api/hk-transactions', row);
        const created = createRes?.data || {};
        results.push(created);

        // Only attach files for the *final* current row (not for queued rows)
        const isCurrentRow = row === payload;
        if (isCurrentRow && files && files.length) {
          const uploads = files.map((file) => {
            const fd = new FormData();
            if (row.unitId) fd.append('unit', String(row.unitId));
            if (row.description) fd.append('description', row.description);
            if (created.id != null) fd.append('transaction', String(created.id));
            fd.append('transactionType', 'hk');
            fd.append('document', file);
            return api.post('/api/unit-documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          });
          await Promise.all(uploads);
        }
      }

      // Clear queue & reset form
      setPendingRows([]);
      setFiles([]);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        unitId: '',
        unitName: '',
        allocationTarget: 'Unit',
        allocateTo: '',
        city: '',
        categoryId: '',
        categoryName: '',
        costCentre: '',
        description: '',
        paid: '',
        charged: ''
      });
      setUserEditedCharged(false);

      if (onSave) onSave({ rows: results });
      if (onCancel) onCancel();
    } catch (error) {
      console.error('Error saving HK transactions:', error);
      const apiMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        (typeof error?.response?.data === 'string' ? error.response.data : null) ||
        error?.message ||
        'There was an error saving the transactions.';
      // If this was the main Save (not Add Another), rethrow so FormLayout shows banner+toast
      if (!addAnother) {
        throw new Error(apiMessage);
      }
      // For Add Another, show a local toast
      try { toast.error(apiMessage, { autoClose: 1500 }); } catch {}
    }
  };

  const handleFilesSelected = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setFiles((prev) => [...prev, ...picked]);
    // allow picking the same file again later
    e.target.value = '';
  };

  const removeQueuedFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Helper for unit selection logic (used in both onChange and onInput)
  const applyUnitSelection = (value) => {
    const selectedUnit = units.find((u) => u.unitName === value);
    const isHK = value === 'Housekeepers';
    const cleaningFee = selectedUnit ? (selectedUnit.cleaningFee ?? selectedUnit.cleaning_fee ?? 0) : 0;
    setFormData((prev) => ({
      ...prev,
      unitName: value,
      unitId: selectedUnit ? selectedUnit.id : '',
      city: isHK ? '' : (selectedUnit?.city || prev.city),
      costCentre: isHK
        ? 'Housekeepers'
        : (selectedUnit?.status === 'Alor'
            ? 'Client'
            : (selectedUnit?.status === 'Active' && isCleaningCategory(prev.categoryName)
                ? 'Owners2'
                : prev.costCentre)),
      allocationTarget: isHK ? '' : 'Unit',
      allocateTo: isHK ? '' : prev.allocateTo,
      charged: (!isHK && selectedUnit?.status === 'Alor' && !isCleaningCategory(prev.categoryName))
        ? (prev.paid ?? '')
        : ((!isHK && isCleaningCategory(prev.categoryName)) ? cleaningFee : prev.charged)
    }));
    setUserEditedCharged(false);
  };
  return (
    <FormLayout
      title="New HK Transaction"
      onSubmit={(e) => handleSubmit(e, false)}
      moneyFields={['paid', 'charged']}
      onCancel={onCancel}
    >
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
        <input
          list="units"
          name="unitName"
          value={formData.unitName}
          onChange={(e) => applyUnitSelection(e.target.value)}
          onInput={(e) => applyUnitSelection(e.target.value)}
          required
        />
        <datalist id="units">
          {units.map((unit) => (
            <option key={unit.id} value={unit.unitName} />
          ))}
        </datalist>
      </FormLayout.Row>

      {formData.unitName === 'Housekeepers' && (
        <FormLayout.Row label="Allocate to">
          <select
            name="allocateTo"
            value={formData.allocateTo}
            onChange={(e) => {
              const value = e.target.value;
              let allocationTarget = '';
              let city = '';
              if (value === 'Playa del Carmen') {
                allocationTarget = 'Housekeepers_Playa';
                city = 'Playa del Carmen';
              } else if (value === 'Tulum') {
                allocationTarget = 'Housekeepers_Tulum';
                city = 'Tulum';
              } else if (value === 'General') {
                allocationTarget = 'Housekeepers_General';
                city = 'General';
              }
              setFormData((prev) => ({
                ...prev,
                allocateTo: value,
                allocationTarget,
                city
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
            const selectedUnitForCat = units.find((u) => u.unitName === formData.unitName);
            const cleaningFeeForCat = selectedUnitForCat ? (selectedUnitForCat.cleaningFee ?? selectedUnitForCat.cleaning_fee ?? 0) : 0;
            setFormData((prev) => ({
              ...prev,
              categoryId: id,
              categoryName: name,
              costCentre: (selectedUnitForCat?.status === 'Alor')
                ? (prev.costCentre || 'Client')
                : ((selectedUnitForCat?.status === 'Active' && isCleaningCategory(name))
                    ? 'Owners2'
                    : (defaults.includes(name) ? 'Housekeepers' : prev.costCentre)),
              charged: (isCleaningCategory(name) && prev.unitName && prev.unitName !== 'Housekeepers')
                ? cleaningFeeForCat
                : prev.charged
            }));
            // Optional: reset userEditedCharged if selected unit is Alor and charged not changed here
            if (selectedUnitForCat?.status === 'Alor') {
              setUserEditedCharged(false);
            }
          }}
          required
        >
          <option value="">Select</option>
          {Array.isArray(categories) && categories.map((cat) => (
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
          <option value="">Select</option>
          {costCentres.map((cc) => (
            <option key={cc} value={cc}>
              {cc}
            </option>
          ))}
        </select>
      </FormLayout.Row>

      <FormLayout.Row label="Description">
        <textarea
          name="description"
          value={formData.description || ''}
          onChange={handleChange}
          placeholder="Enter description"
        />
      </FormLayout.Row>

      <FormLayout.Row label="Paid">
        <input
          type="text"
          name="paid"
          value={formData.paid === '' || formData.paid === 0 ? '$' : formData.paid}
          onFocus={() => {
            setFormData((prev) => ({ ...prev, paid: '' }));
          }}
          onBlur={(e) => {
            if (e.target.value === '' || e.target.value === '$') {
              setFormData((prev) => ({ ...prev, paid: 0 }));
            }
          }}
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9.]/g, '');
            setFormData((prev) => ({ ...prev, paid: value }));
          }}
        />
      </FormLayout.Row>

      <FormLayout.Row label="Charged">
        <input
          type="text"
          name="charged"
          value={formData.charged === '' || formData.charged === 0 ? '$' : formData.charged}
          onFocus={() => {
            setFormData((prev) => ({ ...prev, charged: '' }));
          }}
          onBlur={(e) => {
            if (e.target.value === '' || e.target.value === '$') {
              setFormData((prev) => ({ ...prev, charged: 0 }));
            }
          }}
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9.]/g, '');
            setUserEditedCharged(true);
            setFormData((prev) => ({ ...prev, charged: value }));
          }}
        />
      </FormLayout.Row>

      <FormLayout.Row label="Documents">
        <input
          type="file"
          multiple
          onChange={handleFilesSelected}
          accept="image/*,application/pdf"
        />
        {files.length > 0 && (
          <ul className="file-list">
            {files.map((f, idx) => (
              <li key={`${f.name}-${idx}`}> 
                <span>{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeQueuedFile(idx)}
                  style={{ marginLeft: '8px' }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </FormLayout.Row>

      {pendingRows.length > 0 && (
        <FormLayout.Row label="Queued">
          <div style={{ fontSize: '0.9rem' }}>
            <div style={{ marginBottom: 6 }}>
              <strong>{pendingRows.length}</strong> item{pendingRows.length > 1 ? 's' : ''} queued. They will be saved when you click <em>Save</em>.
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {pendingRows.map((r, idx) => (
                <li key={idx}>
                  {r.date} — {r.unitId || r.city} — {r.costCentre || ''} — ${r.paid || 0}
                  <button type="button" onClick={() => setPendingRows((prev) => prev.filter((_, i) => i !== idx))} style={{ marginLeft: 8 }}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
        </FormLayout.Row>
      )}

      <FormLayout.Row label="">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={(e) => handleSubmit(e, true)}
        >
          Add Another
        </button>
      </FormLayout.Row>

      <FormLayout.Row label="">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            type="submit"
            className="btn btn-primary"
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginLeft: 8 }}
            onClick={async () => {
              // On Cancel: save any queued rows, drop only current form
              let createdRows = [];
              if (pendingRows.length) {
                try {
                  for (const row of pendingRows) {
                    const res = await api.post('/api/hk-transactions', row);
                    createdRows.push(res?.data || {});
                  }
                } catch (err) {
                  console.error('Error auto-saving queued rows on Cancel:', err);
                }
              }
              if (createdRows.length && onSave) {
                onSave({ rows: createdRows });
              }
              setPendingRows([]);
              setFiles([]);
              setFormData({
                date: new Date().toISOString().split('T')[0],
                unitId: '',
                unitName: '',
                allocationTarget: 'Unit',
                allocateTo: '',
                city: '',
                categoryId: '',
                categoryName: '',
                costCentre: '',
                description: '',
                paid: '',
                charged: ''
              });
              setUserEditedCharged(false);
              if (onCancel) onCancel();
            }}
          >
            Cancel
          </button>
        </div>
      </FormLayout.Row>
    </FormLayout>
  );
};

export default HKTransactionForm;