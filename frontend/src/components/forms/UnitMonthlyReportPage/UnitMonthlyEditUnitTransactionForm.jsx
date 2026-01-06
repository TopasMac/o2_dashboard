import React, { useState, useEffect } from 'react';
import api from '../../../api';
import FormLayoutInline from '../../layouts/FormLayoutInline';

// Normalize unit to an id string whether it's an object, IRI, or raw id
const extractUnitId = (unit) => {
  if (!unit) return '';
  if (typeof unit === 'string') {
    // IRI or plain id string
    const parts = unit.split('/');
    const last = parts.pop() || '';
    return (last || unit).toString();
  }
  if (typeof unit === 'object') {
    if (unit['@id']) {
      const parts = unit['@id'].split('/');
      return (parts.pop() || '').toString();
    }
    if (unit.id !== undefined && unit.id !== null) return unit.id.toString();
  }
  return '';
};

const EditUnitTransactionForm = ({ transactionId, onClose, onSave, setHighlightId }) => {
  const serviceDescriptions = [
    { value: 'HOA', label: 'HOA' },
    { value: 'CFE', label: 'CFE' },
    { value: 'Internet', label: 'Internet' },
    { value: 'Aguakan', label: 'Agua' }
  ];
  const [transaction, setTransaction] = useState(null);
  const [addToO2, setAddToO2] = useState(false);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [unitName, setUnitName] = useState('');
  const [formData, setFormData] = useState({
    date: '',
    category: '',
    description: '',
    amount: '',
    comments: '',
    type: '',
  });
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [unitId, setUnitId] = useState('');

  // Fetch units for lookup
  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const response = await api.get('/api/units');
        const unitsArray = response.data['hydra:member'] || response.data['member'] || response.data || [];
        setUnits(unitsArray);
      } catch (error) {
        console.error('Failed to fetch units:', error);
      }
    };
    fetchUnits();
  }, []);

  // Fetch transaction and set formData
  useEffect(() => {
    if (!transactionId) return;
    const fetchTransaction = async () => {
      try {
        const response = await api.get(`/api/unit_transactions/${transactionId}`);
        const data = response.data;
        setTransaction(data);
        const extractedUnitId = extractUnitId(data.unit);
        setUnitId(extractedUnitId);
        // Derive unitName
        let name = '';
        if (data.unit && data.unit.unitName) name = data.unit.unitName;
        else if (data.unit && typeof data.unit === 'object' && data.unit.id && units.length > 0) {
          const u = units.find(u => u.id === data.unit.id);
          if (u) name = u.unitName;
        }
        setUnitName(name);
        setFormData({
          date: data.date ? String(data.date).slice(0, 10) : '',
          category: data.category?.id?.toString() || '',
          description: data.description || '',
          amount: data.amount != null ? String(data.amount) : '',
          comments: data.comments || '',
          type:
            (data.type === 'expense' || data.type === 'Gasto') ? 'Gasto'
            : (data.type === 'income' || data.type === 'Ingreso') ? 'Abono'
            : '',
        });
        // Normalize attachments from various possible keys
        const docsRaw = Array.isArray(data.documents)
          ? data.documents
          : Array.isArray(data.unitDocuments)
            ? data.unitDocuments
            : Array.isArray(data.attachments)
              ? data.attachments
              : [];
        const docs = docsRaw.map(d => ({
          id: d.id ?? parseInt(String((d['@id'] || '').split('/').pop()), 10),
          filename: d.filename || d.name || d.label || 'document',
          url: d.publicUrl || d.s3Url || d.documentUrl || d.url || '',
        })).filter(d => d.id);
        setAttachments(docs);
      } catch (error) {
        console.error('Failed to fetch transaction:', error);
      }
    };
    fetchTransaction();
    // eslint-disable-next-line
  }, [transactionId, units]);

  // Derive unitName from transaction and units if not available
  useEffect(() => {
    if (!transaction) return;
    let name = '';
    if (transaction.unit && transaction.unit.unitName) name = transaction.unit.unitName;
    else if (transaction.unit && typeof transaction.unit === 'object' && transaction.unit.id && units.length > 0) {
      const u = units.find(u => u.id === transaction.unit.id);
      if (u) name = u.unitName;
    }
    setUnitName(name);
  }, [transaction, units]);

  // Fetch categories, filter and sort
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await api.get('/api/transaction_categories');
        const data = response.data;
        const raw = data['hydra:member'] || data['member'] || data || [];
        const list = raw
          .map((c) => {
            const id = c.id ?? parseInt((c['@id'] || '').split('/').pop(), 10);
            let t = c.type || '';
            if (t === 'income') t = 'Ingreso';
            if (t === 'expense') t = 'Gasto';
            if (t === 'both') t = 'Both';
            const allowUnit = c.allowUnit === true || c.allow_unit === 1 || c.allow_unit === true;
            return { id, name: c.name || c.categoryName || '', type: t, allowUnit };
          })
          .filter((c) => (c.type === 'Gasto' || c.type === 'Both') && c.allowUnit);
        setCategories(list.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    const cat = categories.find(c => c.id?.toString() === formData.category);
    if (!cat || cat.type !== 'Both') {
      setFormData(prev => ({ ...prev, type: '' }));
    }
  }, [formData.category, categories]);

  if (!transaction) return <div>Loading...</div>;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Determine if category is "Pago de Servicios" (id === '1')
  const selectedCategory = categories.find(c => c.id?.toString() === formData.category);
  const isPagoDeServicios = selectedCategory?.name === 'Pago de Servicios' || formData.category === '1';
  const isBothCategory = selectedCategory?.type === 'Both';
  // Add to O2 toggle logic
  const isReembolsoPropietario = selectedCategory?.id?.toString() === '6';
  const isIngreso = formData.type === 'Abono' || formData.type === 'Ingreso';

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Normalize decimal separator for amount: accept "1234,56" and convert to "1234.56"
    const normalizedAmountStr = (formData.amount ?? '').toString().replace(',', '.').trim();
    try {
      const typePayload = isBothCategory
        ? (formData.type === 'Gasto' ? 'Gasto' : formData.type === 'Abono' ? 'Ingreso' : null)
        : null;
      const patchData = {
        date: formData.date || null,
        category: formData.category ? `/api/transaction_categories/${formData.category}` : null,
        description: formData.description,
        comments: formData.comments,
        amount: normalizedAmountStr === '' ? '' : String(parseFloat(normalizedAmountStr).toFixed(2)),
        ...(typePayload ? { type: typePayload } : {}),
      };
      const response = await api.patch(
        `/api/unit_transactions/${transactionId}`,
        patchData,
        {
          headers: { 'Content-Type': 'application/merge-patch+json' }
        }
      );
      // Add to O2 transactions logic
      if (addToO2) {
        try {
          const city = transaction?.unit?.city || 'General';
          let costCentre = 'Owners2';
          if (/tulum/i.test(city)) costCentre = 'Owners2_Tulum';
          else if (/playa\s*del\s*carmen/i.test(city)) costCentre = 'Owners2_Playa';

          const absAmount = Math.abs(parseFloat(normalizedAmountStr)).toFixed(2);
          await api.post('/api/o2transactions', {
            date: formData.date || null,
            costCentre,
            category: '/api/transaction_categories/6',
            type: 'Gasto',
            description: 'Unit Transactions mirror',
            amount: absAmount,
            comments: formData.comments || null,
            city
          });
        } catch (mirrorErr) {
          console.error('Failed to create mirror O2 transaction:', mirrorErr);
        }
      }
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 1000);
      if (setHighlightId) setHighlightId(transactionId);
      if (onSave) onSave(response.data);
      if (onClose) onClose();
      return response;
    } catch (error) {
      console.error('Error updating transaction:', error);
      const apiMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        (typeof error?.response?.data === 'string' ? error.response.data : null) ||
        error?.message ||
        'Failed to update transaction';
      throw new Error(apiMessage);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    try {
      await api.delete(`/api/unit_transactions/${transactionId}`);
      setFeedbackMessage('Transaction deleted');
      setTimeout(() => setFeedbackMessage(''), 2000);
      if (setHighlightId) setHighlightId(transactionId);
      if (onClose) onClose();
    } catch (error) {
      console.error('Delete error:', error);
      const apiMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        (typeof error?.response?.data === 'string' ? error.response.data : null) ||
        error?.message ||
        'Failed to delete transaction';
      setFeedbackMessage(apiMessage);
      setTimeout(() => setFeedbackMessage(''), 2000);
    }
  };

  const handleDeleteAttachment = async (docId) => {
    try {
      await api.delete(`/api/unit-documents/${docId}`);
      setAttachments(prev => prev.filter(d => d.id !== docId));
      setFeedbackMessage('Attachment deleted');
      setTimeout(() => setFeedbackMessage(''), 1500);
    } catch (error) {
      console.error('Delete attachment error:', error);
      const apiMessage = error?.response?.data?.detail || error?.message || 'Failed to delete attachment';
      setFeedbackMessage(apiMessage);
      setTimeout(() => setFeedbackMessage(''), 2000);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setUploadFile(file);
  };

  const handleUploadAttachment = async () => {
    if (!uploadFile) return;
    if (!transactionId) {
      setFeedbackMessage('Save the transaction before uploading documents');
      setTimeout(() => setFeedbackMessage(''), 2000);
      return;
    }
    try {
      const fd = new FormData();
      fd.append('unit', unitId || extractUnitId(transaction?.unit));
      fd.append('description', formData.description || uploadFile.name);
      fd.append('transaction', String(transactionId));
      fd.append('transactionType', 'unit');
      fd.append('document', uploadFile);
      const resp = await api.post('/api/unit-documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = resp?.data || {};
      const newDoc = {
        id: d.id ?? parseInt(String((d['@id'] || '').split('/').pop() || ''), 10),
        filename: d.filename || uploadFile.name,
        url: d.publicUrl || d.s3Url || d.documentUrl || '',
      };
      setAttachments((prev) => (newDoc.id ? [...prev, newDoc] : prev));
      setUploadFile(null);
      setFeedbackMessage('Attachment uploaded');
      setTimeout(() => setFeedbackMessage(''), 1500);
    } catch (error) {
      console.error('Upload attachment error:', error);
      const apiMessage = error?.response?.data?.detail || error?.message || 'Failed to upload attachment';
      setFeedbackMessage(apiMessage);
      setTimeout(() => setFeedbackMessage(''), 2000);
    }
  };

  return (
    <FormLayoutInline
      title={`Edit Transaction for ${unitName || ''}`}
      onSubmit={handleSubmit}
    >
      {/* Unit Name (readonly) */}
      <div className="form-row">
        <label>Unit Name</label>
        <input type="text" value={unitName} readOnly />
      </div>
      {/* Date */}
      <div className="form-row">
        <label>Date</label>
        <input type="date" name="date" value={formData.date} onChange={handleChange} />
      </div>
      {/* Category */}
      <div className="form-row">
        <label>Category</label>
        <select name="category" value={formData.category} onChange={handleChange}>
          <option value="">Select Category</option>
          {Array.isArray(categories) && categories.map((cat) => (
            <option key={cat.id} value={cat.id.toString()}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>
      {isBothCategory && (
        <div className="form-row">
          <label>Type</label>
          <select name="type" value={formData.type} onChange={handleChange}>
            <option value="">Select Type</option>
            <option value="Gasto">Gasto</option>
            <option value="Abono">Abono</option>
          </select>
        </div>
      )}
      {/* Description */}
      <div className="form-row">
        <label>Description</label>
        {isPagoDeServicios ? (
          <select name="description" value={formData.description} onChange={handleChange}>
            <option value="">Select Description</option>
            {serviceDescriptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input type="text" name="description" value={formData.description} onChange={handleChange} />
        )}
      </div>
      {/* Add to O2 transactions toggle (for Reembolso propietario and Ingreso) */}
      {isReembolsoPropietario && isIngreso && (
        <div className="form-row">
          <label>
            <input
              type="checkbox"
              checked={addToO2}
              onChange={e => setAddToO2(e.target.checked)}
            />
            Add to O2 transactions
          </label>
        </div>
      )}
      {/* Amount */}
      <div className="form-row">
        <label>Amount</label>
        <input type="number" name="amount" value={formData.amount} onChange={handleChange} />
      </div>
      {/* Comments */}
      <div className="form-row">
        <label>Comments</label>
        <textarea name="comments" value={formData.comments} onChange={handleChange} />
      </div>
      {/* Attachments (if any) */}
      {attachments.length > 0 && (
        <div className="form-row">
          <label>Attachments</label>
          <div>
            {attachments.map(doc => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noreferrer">{doc.filename}</a>
                ) : (
                  <span>{doc.filename}</span>
                )}
                <button type="button" className="btn-secondary" onClick={() => handleDeleteAttachment(doc.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Add Attachment */}
      <div className="form-row">
        <label>Add Attachment</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/jpg"
            onChange={handleFileChange}
          />
          <button type="button" className="btn-primary" disabled={!uploadFile} onClick={handleUploadAttachment}>
            Upload
          </button>
        </div>
      </div>
      {/* Actions */}
      <div className="form-actions">
        <button type="submit" className="btn-primary">Save Changes</button>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          type="button"
          className="btn-danger"
          onClick={handleDelete}
        >
          Delete Entry
        </button>
      </div>
      {showConfirmation && (
        <div style={{ color: 'green', fontWeight: 'bold', marginTop: '10px' }}>
          Transaction updated!
        </div>
      )}
      {feedbackMessage && (
        <div style={{ color: 'green', fontWeight: 'bold', marginTop: '10px' }}>
          {feedbackMessage}
        </div>
      )}
    </FormLayoutInline>
  );
};

export default EditUnitTransactionForm;