import React, { useEffect, useState } from 'react';
import FormLayout from '../layouts/FormLayout';
import api from '../../api';

const DEPARTMENTS = ['Admin', 'Construtor', 'Front Desk', 'Operaciones'].sort((a, b) => a.localeCompare(b));

/**
 * EditCondoContactForm
 * Props:
 *  - contactId: number (required)
 *  - onSaved?: () => void
 *  - onCancel?: () => void
 */
export default function EditCondoContactForm({ contactId, onSaved, onCancel }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [department, setDepartment] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setError(null);
      setLoading(true);
      try {
        const resp = await api.get(`/api/condo_contacts/${contactId}`);
        const c = resp.data;
        setDepartment(c.department || '');
        setName(c.name || '');
        setEmail(c.email || '');
        setPhone(c.phone || '');
        setNotes(c.notes || '');
      } catch (err) {
        console.error('Failed to load contact', err);
        const apiMsg = err?.response?.data?.['hydra:description'] || err?.response?.data?.message;
        setError(apiMsg || 'Could not load contact.');
      } finally {
        setLoading(false);
      }
    };
    if (contactId) fetchData();
  }, [contactId]);

  const toNull = (v) => {
    if (v === undefined || v === null) return null;
    const t = String(v).trim();
    return t.length ? t : null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Clear any prior inline error; let FormLayout show submit errors
    setError(null);

    // Basic validations -> throw so FormLayout can catch and render the banner
    if (!department.trim()) {
      const msg = 'Department is required.';
      console.error(msg);
      throw new Error(msg);
    }
    if (!email.trim() && !phone.trim()) {
      const msg = 'Provide at least an email or a phone.';
      console.error(msg);
      throw new Error(msg);
    }

    const payload = {
      department: department.trim(),
      name: toNull(name),
      email: toNull(email),
      phone: toNull(phone),
      notes: toNull(notes),
    };

    setSubmitting(true);
    // Return the promise so FormLayout can await and banner/toast on failure
    return api.patchJson(`/api/condo_contacts/${contactId}`, payload)
      .then(() => {
        if (typeof onSaved === 'function') {
          try { onSaved(); } catch {}
        }
      })
      .catch((err) => {
        console.error('Failed to update contact', err);
        const apiMsg =
          err?.response?.data?.['hydra:description'] ||
          err?.response?.data?.message ||
          err?.message ||
          'Could not save changes.';
        // Rethrow so FormLayout.jsx shows the banner + toast
        throw new Error(apiMsg);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  if (loading) {
    return (
      <div style={{ padding: '1rem' }}>Loading…</div>
    );
  }

  return (
    <FormLayout title="Edit Contact" onSubmit={handleSubmit}>
      {error && (
        <div className="form-error" role="alert">{error}</div>
      )}

      <div className="form-row">
        <label className="form-label" htmlFor="department">Department</label>
        <select
          id="department"
          className="form-input"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          required
        >
          <option value="" disabled>Select department…</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="name">Name</label>
        <input
          id="name"
          type="text"
          className="form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          className="form-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="phone">Phone</label>
        <input
          id="phone"
          type="text"
          className="form-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g., +52 123 456 7890"
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          className="form-textarea"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Shifts, language, internal info…"
        />
      </div>

      <div className="form-actions" style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => onCancel && onCancel()} disabled={submitting}>
          Cancel
        </button>
      </div>
    </FormLayout>
  );
}