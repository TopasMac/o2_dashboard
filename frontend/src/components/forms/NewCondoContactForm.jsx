import React, { useState } from 'react';
import FormLayout from '../layouts/FormLayout';
import api from '../../api';

const DEPARTMENTS = ['Admin', 'Construtor', 'Front Desk', 'Operaciones'].sort((a, b) => a.localeCompare(b));

/**
 * NewCondoContactForm
 * Props:
 *  - condoId: number (required)
 *  - onSaved?: () => void
 *  - onCancel?: () => void
 */
export default function NewCondoContactForm({ condoId, onSaved, onCancel }) {
  const [department, setDepartment] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toNull = (v) => {
    if (v === undefined || v === null) return null;
    const t = String(v).trim();
    return t.length ? t : null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // validations -> throw so FormLayout shows banner + toast
    if (!department.trim()) {
      throw new Error('Department is required.');
    }
    if (!email.trim() && !phone.trim()) {
      throw new Error('Provide at least an email or a phone.');
    }

    const payload = {
      condo: `/api/condos/${condoId}`,
      department: department.trim(),
      name: toNull(name),
      email: toNull(email),
      phone: toNull(phone),
      notes: toNull(notes),
    };

    setSubmitting(true);
    // Return the promise so FormLayout can await and handle errors/success
    return api.post('/api/condo_contacts', payload)
      .then(() => {
        if (onSaved) onSaved();
      })
      .catch((err) => {
        console.error('Failed to create condo contact:', err);
        const apiMsg =
          err?.response?.data?.['hydra:description'] ||
          err?.response?.data?.message ||
          (typeof err?.response?.data === 'string' ? err.response.data : null) ||
          err?.message ||
          'Could not save contact.';
        // Rethrow so FormLayout.jsx shows the banner + toast
        throw new Error(apiMsg);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <FormLayout title="New Contact" onSubmit={handleSubmit}>

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
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => onCancel && onCancel()} disabled={submitting}>
          Cancel
        </button>
      </div>
    </FormLayout>
  );
}