import React, { useMemo, useState, useEffect } from 'react';
import FormLayout from '../layouts/FormLayout';
import api from '../../api';

/**
 * NewReportCommentForm
 *
 * Props:
 * - units?: Array<{ id: number|string, name?: string, unit_name?: string, unitName?: string }>
 * - defaultDate?: string (YYYY-MM-DD)
 * - defaultUnitName?: string
 * - defaultComment?: string
 * - onSubmit?: (payload) => Promise<any> // optional; if provided, should return a promise
 * - onSaved?: (result) => void
 * - onCancel?: () => void
 */
export default function NewReportCommentForm({
  units,
  defaultDate = '',
  defaultUnitName = '',
  defaultComment = '',
  onSubmit,
  onSaved,
  onCancel,
}) {
  const unitsProp = Array.isArray(units) && units.length > 0 ? units : null;

  const normalizeUnitName = (u) => (u?.name ?? u?.unit_name ?? u?.unitName ?? '').toString();

  const [form, setForm] = useState({
    date: (defaultDate && defaultDate.slice) ? defaultDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    unit_name: defaultUnitName || '',
    unit_id: null,
    comment: defaultComment || '',
  });
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [fetchedUnits, setFetchedUnits] = useState([]);

  const getUnitName = (u) => (u?.unit_name ?? u?.unitName ?? u?.name ?? '').toString();

  const haveUnitsProp = Boolean(unitsProp);

  useEffect(() => {
    let cancelled = false;
    if (haveUnitsProp) {
      setFetchedUnits([]); // prefer provided list
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const res = await api.get('/api/units', {
          params: {
            pagination: false,
            lifecycle: 'active,onboarding',
            fields: 'id,unit_name,unitName,name',
          },
        });
        const raw = res?.data;
        const data = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw?.member)
          ? raw.member
          : Array.isArray(raw?.["hydra:member"]) 
          ? raw["hydra:member"]
          : [];
        if (!cancelled) {
          const mapped = data.map((u) => ({ id: u.id, unit_name: getUnitName(u) }));
          setFetchedUnits(mapped);
        }
      } catch (_) {
        if (!cancelled) setFetchedUnits([]);
      }
    })();
    return () => { cancelled = true; };
  }, [haveUnitsProp]);

  const filteredUnits = useMemo(() => {
    const source = unitsProp ? unitsProp : fetchedUnits;
    const q = form.unit_name.trim().toLowerCase();
    const mapped = source.map((u) => ({ id: u.id, name: getUnitName(u) }));
    if (!q) return mapped.slice(0, 20);
    return mapped.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 20);
  }, [unitsProp, fetchedUnits, form.unit_name]);

  const validate = () => {
    if (!form.date) return 'Please select a date.';
    if (!form.unit_name || form.unit_name.trim() === '') return 'Please pick a unit.';
    if (!form.comment || form.comment.trim() === '') return 'Please enter a comment.';
    return null;
  };

  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const err = validate();
    if (err) return Promise.reject(new Error(err));

    // If user typed an exact unit name from the list but didn’t click a suggestion, try to resolve its id
    if (!form.unit_id) {
      const source = unitsProp ? unitsProp : fetchedUnits;
      const match = source.find((u) => getUnitName(u).toLowerCase() === form.unit_name.trim().toLowerCase());
      if (match && match.id != null) {
        form.unit_id = match.id;
      }
    }

    if (!form.unit_id) {
      return Promise.reject(new Error('Please select a unit from the list.'));
    }

    const ym = (form.date && typeof form.date === 'string' && form.date.length >= 7)
      ? form.date.slice(0, 7)
      : new Date().toISOString().slice(0, 7);

    const payload = {
      entry_type: 'REPORT',
      date: form.date,
      yearMonth: ym,
      unit: `/api/units/${form.unit_id}`,
      unit_id: form.unit_id,
      unit_name: form.unit_name,
      comment: form.comment,
    };

    if (typeof onSubmit === 'function') {
      return Promise.resolve(onSubmit(payload)).then((res) => {
        if (typeof onSaved === 'function') { try { onSaved(res); } catch (_) {} }
        return res;
      });
    }

    return Promise.resolve(payload).then((res) => {
      if (typeof onSaved === 'function') { try { onSaved(res); } catch (_) {} }
      return res;
    });
  };

  return (
    <FormLayout
      title="Add Report Comment"
      onSubmit={handleSubmit}
      onCancel={onCancel}
      renderSave
      showCancel
    >
      <div className="form-body">
        <FormLayout.Row label="Date">
          <input
            type="date"
            name="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            required
          />
        </FormLayout.Row>

        <FormLayout.Row label="Unit">
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              name="unit_name"
              value={form.unit_name}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, unit_name: v, unit_id: null }));
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Select Unit"
              autoComplete="off"
              required
            />
            <input type="hidden" name="unit_id" value={form.unit_id || ''} readOnly />
            {showSuggestions && filteredUnits.length > 0 && (
              <ul style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 6,
                margin: 0,
                padding: 0,
                listStyle: 'none',
                maxHeight: 180,
                overflowY: 'auto',
                zIndex: 1000,
              }}>
                {filteredUnits.map((u) => (
                  <li
                    key={u.id}
                    style={{ padding: '8px 10px', cursor: 'pointer' }}
                    onMouseDown={() => {
                      setForm((f) => ({ ...f, unit_name: u.name, unit_id: u.id }));
                      setShowSuggestions(false);
                    }}
                  >
                    {u.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FormLayout.Row>

        <FormLayout.Row label="Comment">
          <textarea
            name="comment"
            value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
            placeholder="Write your comment"
            rows={4}
            required
          />
        </FormLayout.Row>
      </div>
    </FormLayout>
  );
}