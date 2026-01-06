import React, { useState } from 'react';
import FormLayout from '../../layouts/FormLayout';
import api from '../../../api';

/**
 * UnitMonthlyReportNewCommentForm
 *
 * Purpose: page-specific wrapper used in Unit Monthly Report to add a new
 * report comment for a given unit & year-month. Keeps the base "new" form
 * generic elsewhere.
 *
 * Props:
 * - unitId: number (required)
 * - unitName: string (optional, for title only)
 * - yearMonth: string (YYYY-MM, required)
 * - authorId?: number (optional)
 * - onClose?: () => void
 * - onSaved?: (result) => void
 */
export default function UnitMonthlyReportNewCommentForm({ unitId, unitName, yearMonth, authorId, onClose, onSaved }) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (submitting) return;

    if (!unitId) throw new Error('unitId is required');
    if (!yearMonth || String(yearMonth).length !== 7) throw new Error('yearMonth must be in YYYY-MM format');
    if (!commentText || String(commentText).trim() === '') throw new Error('Please enter a comment.');

    const nowIso = new Date().toISOString();

    // Build payload according to requested fields.
    // Note: `id` is created by the server; do not send it on create.
    const payload = {
      unit_id: unitId,
      unitId: unitId,          // camelCase twin (harmless if ignored)
      unit: `/api/units/${unitId}`,

      // Author, if available
      ...(authorId ? { author_id: authorId } : {}),

      entry_type: 'report',    // DB expects lowercase 'report'
      entryType: 'REPORT',

      note_year_month: yearMonth,
      noteYearMonth: yearMonth,
      yearMonth: yearMonth,

      note_comment: commentText,
      noteComment: commentText,
      comment: commentText,

      created_at: nowIso,
      createdAt: nowIso,
      updated_at: nowIso,      // same as created_at on create (per requirement)
      updatedAt: nowIso,
    };

    try {
      setSubmitting(true);
      const res = await api.post('/api/client_unit_notes', payload, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      if (typeof onSaved === 'function') {
        try { onSaved(res?.data ?? payload); } catch {}
      }
      if (typeof onClose === 'function') onClose();
      return res;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormLayout
      title={`Add Comment${unitName ? ` to ${unitName}` : ''}`}
      onSubmit={handleSubmit}
      onCancel={onClose}
      renderSave
      showCancel
    >
      <div className="form-body">
        <FormLayout.Row label="Comment">
          <textarea
            name="note_comment"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write a note about this unit/month"
            rows={6}
            required
            disabled={submitting}
          />
        </FormLayout.Row>
      </div>
    </FormLayout>
  );
}