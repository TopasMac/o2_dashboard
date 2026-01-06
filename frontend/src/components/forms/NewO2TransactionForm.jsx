import React, { useEffect, useMemo, useState } from 'react';
import FormLayoutInline from '../layouts/FormLayoutInline';
import '../layouts/FormLayoutInline.css';
import api from '../../api';
import { useNavigate } from 'react-router-dom';

export default function NewO2TransactionForm({ defaultValues, onSaved, onCreated, onCancel, hideFileUpload = false }) {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const EXTERNAL_SERVICE_OPTIONS = ['Alorvacations', 'Servicio Shuttle', 'Tours', 'Otro'];
  const [extDescOption, setExtDescOption] = useState('');
  const [extCustomDesc, setExtCustomDesc] = useState('');

  const [formData, setFormData] = useState({
    costCentre: 'Owners2',
    date: '', // user must choose; prevents silent default to "today"
    category: '', // will hold id
    type: 'Ingreso',
    description: '',
    amount: '',
    paid: '',
    charged: '',
    comments: '',
    createdBy: '',
    private: false,
  });

  // On mount, set createdBy from localStorage user name (if available)
  useEffect(() => {
    try {
      // Prefer explicit keys first
      const nameStr = localStorage.getItem('name');
      if (nameStr) {
        setFormData((prev) => ({ ...prev, createdBy: nameStr }));
      }

      const rolesRaw = localStorage.getItem('roles');
      if (rolesRaw) {
        const roles = JSON.parse(rolesRaw);
        if (Array.isArray(roles) && roles.includes('ROLE_ADMIN')) {
          setIsAdmin(true);
        }
      }

      // Backward compatibility: legacy "user" object
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?.name && !nameStr) {
          setFormData((prev) => ({ ...prev, createdBy: user.name }));
        }
        if (Array.isArray(user?.roles) && user.roles.includes('ROLE_ADMIN')) {
          setIsAdmin(true);
        }
      }
    } catch (e) {
      // ignore parse errors, keep defaults
    }
  }, []);

  // Hydrate formData from defaultValues
  useEffect(() => {
    if (!defaultValues) return;

    setFormData((prev) => ({
      ...prev,
      date: defaultValues.date || prev.date,
      amount: defaultValues.amount || prev.amount,
      description: defaultValues.notes || prev.description,
    }));
  }, [defaultValues]);

  // Set default date to today (local), but do not override if already set
  useEffect(() => {
    setFormData((prev) => {
      if (prev.date) return prev;
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const today = `${yyyy}-${mm}-${dd}`;
      return { ...prev, date: today };
    });
  }, []);

  // Fetch categories for the dropdown (income/expense/both)
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const endpoints = [
          '/api/transaction_categories?pagination=false&allow_o2=1',
          '/api/transaction_categories?pagination=false',
          '/api/transaction-categories?pagination=false&allow_o2=1',
          '/api/transaction-categories?pagination=false',
        ];

        let data = null;
        let usedAllowO2Param = false;

        for (const ep of endpoints) {
          const res = await api.get(ep);
          let raw = null;
          if (Array.isArray(res.data)) {
            raw = res.data;
          } else if (res.data) {
            raw = res.data.member || res.data['hydra:member'] || res.data.items || res.data.data || null;
            if (!raw && typeof res.data === 'object') {
              // If res.data is an object and none of the above keys exist,
              // but it has properties, maybe it's the array itself
              if (Array.isArray(Object.values(res.data))) {
                raw = res.data;
              }
            }
          }
          if (raw && raw.length > 0) {
            data = raw;
            usedAllowO2Param = ep.includes('allow_o2=1');
            break;
          }
        }

        if (!data) {
          if (isMounted) setCategories([]);
          return;
        }

        let list = data.map((c) => {
          const id = c.id ?? parseInt((c['@id'] || '').split('/').pop(), 10);
          // Normalize type to 'Ingreso' | 'Gasto' | 'Both'
          let t = c.type || 'Both';
          if (t === 'income') t = 'Ingreso';
          if (t === 'expense') t = 'Gasto';
          if (t === 'both') t = 'Both';
          const allowO2 = c.allowO2 ?? c.allow_o2 ?? false;
          return {
            id,
            name: c.name || c.categoryName || '',
            type: t,
            allowO2,
          };
        });

        // Always enforce allowO2 on the client, regardless of endpoint behavior
        list = list.filter((c) => c.allowO2 === true || c.allowO2 === 1);

        list.sort((a,b) => a.name.localeCompare(b.name));
        if (isMounted) setCategories(list);
      } catch (e) {
        console.error('Failed to fetch categories', e);
        if (isMounted) setError('No se pudieron cargar las categorías');
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Determine selected category object
  const selectedCategory = useMemo(
    () => categories.find((c) => String(c.id) === String(formData.category)) || null,
    [categories, formData.category]
  );

  // Sync external services description selector with current category/description
  useEffect(() => {
    const isExternal = Number(selectedCategory?.id) === 21;
    if (!isExternal) {
      // reset selector state when leaving the category
      if (extDescOption || extCustomDesc) {
        setExtDescOption('');
        setExtCustomDesc('');
      }
      return;
    }
    // if description matches one of the predefined options, pick it
    const current = (formData.description || '').trim();
    if (EXTERNAL_SERVICE_OPTIONS.includes(current)) {
      if (extDescOption !== current) setExtDescOption(current);
      if (current !== 'Otro' && extCustomDesc) setExtCustomDesc('');
    } else {
      // otherwise default to 'Otro' and keep custom text
      if (extDescOption !== 'Otro') setExtDescOption('Otro');
      if (current && current !== extCustomDesc) setExtCustomDesc(current);
    }
  }, [selectedCategory, formData.description]);

  // Enforce type based on category.type
  useEffect(() => {
    if (!selectedCategory) return;
    if (selectedCategory.type === 'Ingreso' && formData.type !== 'Ingreso') {
      setFormData((p) => ({ ...p, type: 'Ingreso' }));
    } else if (selectedCategory.type === 'Gasto' && formData.type !== 'Gasto') {
      setFormData((p) => ({ ...p, type: 'Gasto' }));
    }
  }, [selectedCategory]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Normal fields: just update
    if (name !== 'paid' && name !== 'charged') {
      setFormData((prev) => ({ ...prev, [name]: value }));
      return;
    }

    // Special logic for Paid / Charged when category type is Both
    setFormData((prev) => {
      const next = { ...prev, [name]: value };

      const catType = selectedCategory?.type || 'Both';
      if (catType !== 'Both') {
        return next;
      }

      const paidRaw = (next.paid ?? '').toString().trim();
      const chargedRaw = (next.charged ?? '').toString().trim();

      let paid = 0;
      let charged = 0;

      if (paidRaw) {
        const n = Number(paidRaw.replace(',', '.'));
        if (!Number.isNaN(n)) paid = n;
      }
      if (chargedRaw) {
        const n = Number(chargedRaw.replace(',', '.'));
        if (!Number.isNaN(n)) charged = n;
      }

      if (paid > charged) {
        next.type = 'Gasto';
      } else if (paid < charged) {
        next.type = 'Ingreso';
      }
      // If equal, keep existing type
      return next;
    });
  };

  const handleFileChange = (e) => {
    const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setUploadFile(f);
  };

  const validate = () => {
    if (!formData.date) return 'Fecha es obligatoria';
    if (!formData.category) return 'Categoría es obligatoria';
    const catType = selectedCategory?.type || 'Both';
    if (catType === 'Both') {
      // Categories with type Both: derive amount from Charged - Paid.
      // Empty values are treated as 0.
      const paidRaw = (formData.paid ?? '').toString().trim();
      const chargedRaw = (formData.charged ?? '').toString().trim();

      let paid = 0;
      let charged = 0;

      if (paidRaw) {
        const n = Number(paidRaw.replace(',', '.'));
        if (isNaN(n)) {
          return 'Paid debe ser un número válido';
        }
        paid = n;
      }

      if (chargedRaw) {
        const n = Number(chargedRaw.replace(',', '.'));
        if (isNaN(n)) {
          return 'Charged debe ser un número válido';
        }
        charged = n;
      }

      const diff = charged - paid;
      if (diff === 0) {
        return 'La diferencia entre Charged y Paid debe ser distinta de cero';
      }
      // skip amount validation for this case
    } else {
      if (!formData.amount || isNaN(Number(formData.amount)) || Number(formData.amount) <= 0) {
        return 'Monto debe ser un número positivo';
      }
    }
    // Validate direction against category
    if (selectedCategory) {
      if (selectedCategory.type === 'Ingreso' && formData.type !== 'Ingreso') return 'La categoría es solo de ingreso';
      if (selectedCategory.type === 'Gasto' && formData.type !== 'Gasto') return 'La categoría es solo de gasto';
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const v = validate();
    if (v) {
      // Let FormLayout render the banner + toast
      throw new Error(v);
    }
    setLoading(true);
    try {
      // Normalize date to YYYY-MM-DD explicitly
      const rawDate = (formData.date || '').toString().trim();
      let normDate = '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        normDate = rawDate;
      } else {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          // Force to UTC date-part to avoid timezone shifts
          normDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
        } else {
          normDate = new Date().toISOString().slice(0, 10);
        }
        console.debug('[NewO2TransactionForm] submitting date:', { raw: formData.date, norm: normDate });
      }
      // Normalize decimal separator for amount: allow "1234,56" and convert to "1234.56"
      const catTypeSubmit = selectedCategory?.type || 'Both';
      let normalizedAmountStr;
      let resolvedType = formData.type;

      if (catTypeSubmit === 'Both') {
        const paidNum = Number((formData.paid ?? '').toString().replace(',', '.').trim() || '0');
        const chargedNum = Number((formData.charged ?? '').toString().replace(',', '.').trim() || '0');
        const diff = chargedNum - paidNum;
        normalizedAmountStr = Math.abs(diff).toFixed(2);

        if (paidNum > chargedNum) {
          resolvedType = 'Gasto';
        } else if (paidNum < chargedNum) {
          resolvedType = 'Ingreso';
        }
      } else {
        normalizedAmountStr = (formData.amount ?? '').toString().replace(',', '.').trim();
      }
      const payload = {
        costCentre: formData.costCentre,
        date: normDate,
        category: `/api/transaction_categories/${formData.category}`,
        type: resolvedType,
        description: formData.description || null,
        amount: normalizedAmountStr === '' ? null : String(parseFloat(normalizedAmountStr).toFixed(2)),
        comments: formData.comments || null,
        createdBy: formData.createdBy || null,
        private: !!formData.private,
        // Allocation / source metadata (used when called from EmployeeCash allocation flow)
        sourceType: defaultValues?.sourceType || null,
        sourceId: defaultValues?.sourceId || null,
        sourceAttachments: Array.isArray(defaultValues?.attachments)
          ? defaultValues.attachments
              .filter((a) => a && a.documentId)
              .map((a) => ({ documentId: a.documentId }))
          : [],
      };

      // 1) Create the O2 transaction
      const res = await api.post('/api/o2transactions/create', payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      const raw = res?.data || {};
      // Unwrap common shapes: { success, row }, { row }, or plain row
      const txRow =
        raw.row ||
        raw.data ||
        raw;

      const txId =
        txRow.id ||
        (typeof txRow['@id'] === 'string' ? txRow['@id'].split('/').pop() : undefined);

      // 2) Optional: upload attached document
      if (txId && uploadFile) {
        const fd = new FormData();
        fd.append('file', uploadFile);
        // Required by DocumentUploadService
        fd.append('unitId', '0'); // O2 transactions don't belong to a unit; backend treats 0/null as N/A
        // Useful metadata defaults for O2 docs
        fd.append('label', 'O2 Transactions');
        fd.append('category', 'O2 Transactions');
        if (formData.createdBy) {
          fd.append('uploaded_by', String(formData.createdBy));
        }
        if (formData.category) fd.append('category_id', String(formData.category));
        if (formData.type) fd.append('tx_type', String(formData.type));
        if (formData.date) fd.append('date', String(formData.date));
        if (formData.description) fd.append('description', String(formData.description));

        try {
          await api.post(`/api/o2transactions/${txId}/documents/upload`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (upErr) {
          console.error('Upload document failed:', upErr);
          // Non-fatal: we keep the transaction creation, but surface a soft error
          setError('Transacción creada, pero el documento no se pudo subir.');
        }
      }

      // UI success state
      setMessage('Transaction created');
      setTimeout(() => setMessage(''), 1000);

      // Reset minimal fields but keep costCentre and date for faster entry
      setFormData((p) => ({
        ...p,
        category: '',
        type: selectedCategory?.type === 'Gasto' ? 'Gasto' : 'Ingreso',
        description: '',
        amount: '',
        paid: '',
        charged: '',
        comments: '',
      }));
      setUploadFile(null);

      const handler = onSaved || onCreated;
      if (handler) {
        handler(txRow); // parent handles nav/refresh with the unwrapped row (id, code, etc.)
      } else {
        navigate('/o2-transactions');
      }
    } catch (err) {
      console.error('Create O2 transaction error:', err);
      const apiMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        (typeof err?.response?.data === 'string' ? err.response.data : null) ||
        err?.message ||
        'Error al crear la transacción';
      // Rethrow so FormLayout shows the banner + toast
      throw new Error(apiMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderTypeControl = () => {
    // Tipo is derived from category rules and/or Paid/Charged, never manually edited
    return (
      <select
        name="type"
        value={formData.type}
        onChange={handleChange}
        disabled
        style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
      >
        <option value="Ingreso">Ingreso</option>
        <option value="Gasto">Gasto</option>
      </select>
    );
  };

  return (
    <FormLayoutInline
      title="New O2 Transaction"
      onSubmit={handleSubmit}
      mode="new"
      style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', marginLeft: 0 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, width: '100%', maxWidth: '640px', minWidth: 0 }}>
      {/* Cost Centre */}
      <div className="form-row" style={{ minWidth: 0 }}>
        <label>Cost Centre</label>
        <select
          name="costCentre"
          value={formData.costCentre}
          onChange={(e) => {
            const val = e.target.value;
            setFormData((prev) => {
              // If selecting Housekeepers, auto-assign Cash Advance (id 22) and type Gasto
              if (val === 'Housekeepers') {
                return { ...prev, costCentre: val, category: '22', type: 'Gasto' };
              }
              return { ...prev, costCentre: val };
            });
          }}
          style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
        >
          <option value="Owners2">Owners2 (General)</option>
          <option value="Owners2_Playa">Owners2_Playa (Playa del Carmen)</option>
          <option value="Owners2_Tulum">Owners2_Tulum (Tulum)</option>
          <option value="Housekeepers">Housekeepers</option>
        </select>
      </div>

      {/* Fecha */}
      <div className="form-row" style={{ minWidth: 0 }}>
        <label>Fecha</label>
        <input
  type="date"
  name="date"
  value={formData.date || ''}
  onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
  style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
/>
      </div>

      {/* Categoría */}
      <div className="form-row" style={{ minWidth: 0 }}>
        <label>Categoría</label>
        <select
          name="category"
          value={formData.category}
          onChange={(e) => {
            const id = e.target.value;
            setFormData((p) => ({ ...p, category: id }));
          }}
          style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
        >
          <option value="">Seleccione…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tipo */}
      <div className="form-row" style={{ minWidth: 0 }}>
        <label>Tipo</label>
        {renderTypeControl()}
      </div>

      {/* Descripción */}
      <div className="form-row" style={{ minWidth: 0 }}>
        <label>Descripción</label>
        {(Number(selectedCategory?.id) === 21) ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <select
              value={extDescOption || ''}
              onChange={(e) => {
                const opt = e.target.value;
                setExtDescOption(opt);
                if (opt === 'Otro') {
                  // keep or initialize custom text
                  setFormData((p) => ({ ...p, description: extCustomDesc || '' }));
                } else {
                  setFormData((p) => ({ ...p, description: opt }));
                  if (extCustomDesc) setExtCustomDesc('');
                }
              }}
              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
            >
              <option value="">Seleccione…</option>
              {EXTERNAL_SERVICE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {extDescOption === 'Otro' && (
              <input
                type="text"
                value={extCustomDesc}
                onChange={(e) => {
                  const val = e.target.value;
                  setExtCustomDesc(val);
                  setFormData((p) => ({ ...p, description: val }));
                }}
                placeholder="Especifique…"
                style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
              />
            )}
          </div>
        ) : (
          <input
            type="text"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Descripción de la transacción"
            style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
          />
        )}
      </div>

      {/* Monto / Paid / Charged */}
      {selectedCategory?.type === 'Both' ? (
        <>
          <div className="form-row" style={{ minWidth: 0 }}>
            <label>Paid</label>
            <input
              type="number"
              name="paid"
              min="0"
              step="0.01"
              value={formData.paid}
              onChange={handleChange}
              placeholder="0.00"
              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div className="form-row" style={{ minWidth: 0 }}>
            <label>Charged</label>
            <input
              type="number"
              name="charged"
              min="0"
              step="0.01"
              value={formData.charged}
              onChange={handleChange}
              placeholder="0.00"
              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </>
      ) : (
        <div className="form-row" style={{ minWidth: 0 }}>
          <label>Monto</label>
          <input
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            value={formData.amount}
            onChange={handleChange}
            placeholder="0.00"
            style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
          />
        </div>
      )}

      {/* Comentarios */}
      <div className="form-row" style={{ minWidth: 0 }}>
        <label>Comentarios</label>
        <textarea
          name="comments"
          value={formData.comments}
          onChange={handleChange}
          rows={3}
          style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
        />
      </div>

      {!hideFileUpload && (
        <div style={{ marginTop: 4 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Adjuntar documento (opcional)</label>
          <input
            type="file"
            onChange={handleFileChange}
            accept="application/pdf,image/*"
            style={{ width: '100%' }}
          />
          {uploadFile && (
            <div style={{ fontSize: '0.85rem', marginTop: 6 }}>
              Archivo seleccionado: <strong>{uploadFile.name}</strong>
            </div>
          )}
        </div>
      )}

      {isAdmin && !hideFileUpload && (
        <div style={{ marginTop: '4px' }}>
          <label>
            <input
              type="checkbox"
              name="private"
              checked={!!formData.private}
              onChange={(e) => setFormData((p) => ({ ...p, private: e.target.checked }))}
              style={{ width: '12px', height: '12px', marginRight: '4px' }}
            />
            Private
          </label>
        </div>
      )}

      {error && (
        <div className="form-error" role="alert">{error}</div>
      )}

      {/* Actions */}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar'}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>

      {message && (
        <div style={{ color: 'green', fontWeight: 'bold', marginTop: 10 }}>{message}</div>
      )}
      </div>
    </FormLayoutInline>
  );
}