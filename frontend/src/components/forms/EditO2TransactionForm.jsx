import React, { useEffect, useMemo, useState } from 'react';
import FormLayoutInline from '../layouts/FormLayoutInline';
import '../layouts/FormLayoutInline.css';
import api from '../../api';
import { useNavigate } from 'react-router-dom';

export default function EditO2TransactionForm({ id: txId, onSaved, onCancel }) {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  // External services description controls (Servicios Externos)
  const EXTERNAL_SERVICE_OPTIONS = ['Alorvacations', 'Servicio Shuttle', 'Tours', 'Otro'];
  const [extDescOption, setExtDescOption] = useState('');
  const [extCustomDesc, setExtCustomDesc] = useState('');
  const [existingDoc, setExistingDoc] = useState({ id: null, url: '', has: false });
  const [deletingDoc, setDeletingDoc] = useState(false);

  const [formData, setFormData] = useState({
    costCentre: '',
    date: '',
    category: '',
    type: '',
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

        // Remove "Shuttle" from the Category dropdown (kept only inside Servicios Externos description)
        // Normalize and compare against common variants.
        const normalizeName = (s) => (s || '').toString().trim().toLowerCase();
        const blockedCategoryNames = new Set([
          'shuttle',
          'servicio shuttle',
          'servicios shuttle',
          'shuttles',
        ]);
        list = list.filter((c) => !blockedCategoryNames.has(normalizeName(c.name)));

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

  // Load existing transaction
  useEffect(() => {
    let active = true;
    if (!txId) return;
    (async () => {
      try {
        const res = await api.get(`/api/o2transactions/${txId}`);
        const d = res?.data || {};
        // category may be object or id
        const catId = d.category?.id ?? d.categoryId ?? (d.category && parseInt(String(d.category).split('/').pop(), 10)) ?? '';
        const amt = d.amount != null ? String(d.amount) : '';
        if (active) {
          const isBothTx = d.paid != null || d.charged != null;
          const loadedType = d.type || (isBothTx ? 'Abono' : 'Ingreso');
          setFormData({
            costCentre: d.costCentre || 'Owners2',
            date: d.date || '',
            category: catId ? String(catId) : '',
            // For Both-style transactions, legacy 'Ingreso' should be shown as 'Abono'
            type: (isBothTx && loadedType === 'Ingreso') ? 'Abono' : loadedType,
            description: d.description || '',
            amount: amt,
            // Preserve API values exactly; null -> '' so inputs can render
            paid: d.paid != null ? String(d.paid) : '',
            charged: d.charged != null ? String(d.charged) : '',
            comments: d.comments || '',
            createdBy: d.createdBy || '',
            private: !!d.private,
          });
          setExistingDoc({
            id: d.documentId ?? null, // if API returns id
            url: d.documentUrl || '',
            has: !!d.hasDocument && !!d.documentUrl,
          });
        }
      } catch (e) {
        console.error('Failed to load O2 transaction', e);
        if (active) setError('No se pudo cargar la transacción');
      }
    })();
    return () => { active = false; };
  }, [txId]);

  // Determine selected category object
  const selectedCategory = useMemo(
    () => categories.find((c) => String(c.id) === String(formData.category)) || null,
    [categories, formData.category]
  );

  // Sync external services description selector with current category/description
  useEffect(() => {
    const isExternal = Number(selectedCategory?.id) === 21;
    if (!isExternal) {
      if (extDescOption || extCustomDesc) {
        setExtDescOption('');
        setExtCustomDesc('');
      }
      return;
    }
    const current = (formData.description || '').trim();
    if (EXTERNAL_SERVICE_OPTIONS.includes(current)) {
      if (extDescOption !== current) setExtDescOption(current);
      if (current !== 'Otro' && extCustomDesc) setExtCustomDesc('');
    } else {
      if (extDescOption !== 'Otro') setExtDescOption('Otro');
      if (current && current !== extCustomDesc) setExtCustomDesc(current);
    }
  }, [selectedCategory, formData.description]);

  // Enforce type based on category.type
  useEffect(() => {
    if (!selectedCategory) return;
    // Only enforce for single-direction categories. 'Both' is derived from Paid/Charged.
    if (selectedCategory.type === 'Ingreso' && formData.type !== 'Ingreso') {
      setFormData((p) => ({ ...p, type: 'Ingreso' }));
    } else if (selectedCategory.type === 'Gasto' && formData.type !== 'Gasto') {
      setFormData((p) => ({ ...p, type: 'Gasto' }));
    }
  }, [selectedCategory]);

  // For "Both" categories, derive type from Paid vs Charged:
  // - Paid > Charged  => Gasto
  // - Paid < Charged  => Abono
  useEffect(() => {
    const isBothCategory = (selectedCategory?.type === 'Both');
    // If categories haven't loaded yet but we already have paid/charged values (editing existing tx), treat it as Both.
    const hasPaidChargedValues = String(formData.paid ?? '').trim() !== '' || String(formData.charged ?? '').trim() !== '';

    if (!isBothCategory && !hasPaidChargedValues) return;

    const paidNum = Number((formData.paid ?? '').toString().replace(',', '.').trim() || '0');
    const chargedNum = Number((formData.charged ?? '').toString().replace(',', '.').trim() || '0');

    let derived = formData.type;
    if (paidNum > chargedNum) derived = 'Gasto';
    else if (paidNum < chargedNum) derived = 'Abono';

    if (derived !== formData.type) {
      setFormData((p) => ({ ...p, type: derived }));
    }
  }, [selectedCategory, formData.paid, formData.charged]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
      // Empty Paid/Charged treated as 0
      const paidRaw = (formData.paid ?? '').toString().trim();
      const chargedRaw = (formData.charged ?? '').toString().trim();

      let paid = 0;
      let charged = 0;

      if (paidRaw) {
        const n = Number(paidRaw.replace(',', '.'));
        if (isNaN(n)) return 'Paid debe ser un número válido';
        paid = n;
      }

      if (chargedRaw) {
        const n = Number(chargedRaw.replace(',', '.'));
        if (isNaN(n)) return 'Charged debe ser un número válido';
        charged = n;
      }

      const diff = charged - paid;
      if (diff === 0) return 'La diferencia entre Charged y Paid debe ser distinta de cero';

      // Validate direction against category (Both allows either; nothing to enforce here)
      return '';
    }

    // Non-Both categories use amount
    if (!formData.amount || isNaN(Number(formData.amount)) || Number(formData.amount) <= 0) {
      return 'Monto debe ser un número positivo';
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
    if (v) throw new Error(v);
    setLoading(true);
    try {
      const catTypeSubmit = selectedCategory?.type || 'Both';

      let resolvedType = formData.type;
      let normalizedAmountStr = (formData.amount ?? '').toString().replace(',', '.').trim();

      if (catTypeSubmit === 'Both') {
        const paidNum = Number((formData.paid ?? '').toString().replace(',', '.').trim() || '0');
        const chargedNum = Number((formData.charged ?? '').toString().replace(',', '.').trim() || '0');
        const diff = chargedNum - paidNum;
        normalizedAmountStr = Math.abs(diff).toFixed(2);

        if (paidNum > chargedNum) {
          resolvedType = 'Gasto';
        } else if (paidNum < chargedNum) {
          resolvedType = 'Abono';
        }
      }

      const payload = {
        costCentre: formData.costCentre,
        date: formData.date,
        category: `/api/transaction_categories/${formData.category}`,
        type: resolvedType,
        description: formData.description || null,
        amount: normalizedAmountStr === '' ? null : String(parseFloat(normalizedAmountStr).toFixed(2)),
        comments: formData.comments || null,
        createdBy: formData.createdBy || null,
        private: !!formData.private,
      };
  
      // 1) Update transaction
      const res = await api.put(`/api/o2transactions/${txId}`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      const updated = res?.data || { id: txId };
  
      // 2) Optional: upload replacement document (if a new file was chosen)
      if (uploadFile) {
        const fd = new FormData();
        fd.append('file', uploadFile);
        fd.append('unitId', '0');
        fd.append('label', 'O2 Transactions');
        fd.append('category', 'O2 Transactions');
        if (formData.createdBy) fd.append('uploaded_by', String(formData.createdBy));
        if (formData.category) fd.append('category_id', String(formData.category));
        if (resolvedType) fd.append('tx_type', String(resolvedType));
        if (formData.date) fd.append('date', String(formData.date));
        if (formData.description) fd.append('description', String(formData.description));
        try {
          await api.post(`/api/o2transactions/${txId}/documents/upload`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (upErr) {
          console.error('Upload document failed:', upErr);
          setError('Cambios guardados, pero el documento no se pudo subir.');
        }
      }
  
      setMessage('Cambios guardados');
      setTimeout(() => setMessage(''), 1000);
      if (onSaved) onSaved(updated);
    } catch (err) {
      console.error('Update O2 transaction error:', err);
      const apiMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        (typeof err?.response?.data === 'string' ? err.response.data : null) ||
        err?.message ||
        'Error al guardar la transacción';
      throw new Error(apiMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDoc = async () => {
    if (!existingDoc?.has || !existingDoc.id) return;
    if (!window.confirm('¿Eliminar el documento actual?')) return;
    setDeletingDoc(true);
    try {
      await api.delete(`/api/o2transactions/document/${existingDoc.id}`);
      setExistingDoc({ id: null, url: '', has: false });
    } catch (e) {
      console.error('Delete doc failed', e);
      setError('No se pudo eliminar el documento.');
    } finally {
      setDeletingDoc(false);
    }
  };

  const handleDeleteTx = async () => {
    if (!txId) return;
    if (!window.confirm('¿Eliminar esta transacción O2? Esta acción no se puede deshacer.')) return;
    setLoading(true);
    setError('');
    try {
      await api.delete(`/api/o2transactions/${txId}`);
      setMessage('Transacción eliminada');
      // Notify parent or navigate away
      if (onSaved) {
        onSaved({ id: txId, deleted: true });
      } else {
        navigate('/o2-transactions');
      }
    } catch (e) {
      console.error('Delete O2 transaction failed', e);
      setError('No se pudo eliminar la transacción.');
    } finally {
      setLoading(false);
    }
  };

  const renderTypeControl = () => {
    // For Both, and for non-Both, always disabled now (Both is derived, and others enforced)
    const disabled = true;
    return (
      <select
        name="type"
        value={formData.type}
        onChange={handleChange}
        disabled={disabled}
        style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
      >
        <option value="Abono">Abono</option>
        <option value="Gasto">Gasto</option>
        <option value="Ingreso">Ingreso</option>
      </select>
    );
  };

  return (
    <div className="o2-edit-form-wrap">
      <style>{`
        /* Hide any extra default delete button the layout might render, but keep our own */
        .o2-edit-form-wrap .btn-danger:not([data-own-delete="true"]) { display: none !important; }
      `}</style>
      <FormLayoutInline
        title="Edit O2 Transaction"
        onSubmit={handleSubmit}
        mode="edit"
        style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', marginLeft: 0 }}
      >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, width: '100%', maxWidth: '640px', minWidth: 0 }}>
      {/* Cost Centre */}
      <div className="form-row" style={{ minWidth: 0 }}>
        <label>Cost Centre</label>
        <select name="costCentre" value={formData.costCentre} onChange={handleChange} style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <option value="Owners2">Owners2 (General)</option>
          <option value="Owners2_Playa">Owners2_Playa (Playa del Carmen)</option>
          <option value="Owners2_Tulum">Owners2_Tulum (Tulum)</option>
        </select>
      </div>

      {/* Fecha */}
      <div className="form-row" style={{ minWidth: 0 }}>
        <label>Fecha</label>
        <input type="date" name="date" value={formData.date} onChange={handleChange} style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }} />
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

      {/* Monto / Paid & Charged */}
      {(selectedCategory?.type === 'Both' || String(formData.paid ?? '').trim() !== '' || String(formData.charged ?? '').trim() !== '') ? (
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

      <div style={{ marginTop: 4 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Documento</label>
        {existingDoc.has ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <a
              href={existingDoc.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ver documento actual"
              style={{ display: 'inline-flex', alignItems: 'center', color: '#1e6f68', textDecoration: 'none' }}
            >
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1e6f68"><path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.103.897 2 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"></path></svg>
              <span style={{ marginLeft: 6 }}>Ver documento</span>
            </a>
            <button
              type="button"
              onClick={handleDeleteDoc}
              disabled={deletingDoc}
              className="btn-secondary"
              style={{ padding: '4px 8px' }}
              aria-label="Eliminar documento"
              title="Eliminar documento"
            >
              {deletingDoc ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: 6 }}>No hay documento adjunto.</div>
        )}
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Subir reemplazo (opcional)</label>
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
      </div>

      {isAdmin && (
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
      <div className="form-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {/* Left group: Guardar + Cancelar */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
          {onCancel && (
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancelar
            </button>
          )}
        </div>
        {/* Right group: Eliminar */}
        <div>
          <button
            type="button"
            onClick={handleDeleteTx}
            disabled={loading || !txId}
            className="btn-danger"
            data-own-delete="true"
            style={{ padding: '6px 10px' }}
            title="Eliminar transacción O2"
          >
            Eliminar
          </button>
        </div>
      </div>

      {message && (
        <div style={{ color: 'green', fontWeight: 'bold', marginTop: 10 }}>{message}</div>
      )}
      </div>
      </FormLayoutInline>
    </div>
  );
}