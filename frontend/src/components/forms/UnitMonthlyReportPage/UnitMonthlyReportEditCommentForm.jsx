import React, { useState, useEffect } from 'react';
import FormLayout from '../../layouts/FormLayout';
import api from '../../../api';

/**
 * EditReportCommentsForm (simplified for Unit Monthly page)
 *
 * Props:
 * - noteId?: number
 * - unitId: number
 * - unitName: string
 * - yearMonth: string (YYYY-MM)
 * - initialValue?: string (existing value from client_unit_note.note_comment)
 * - onClose?: () => void
 * - onSaved?: (result) => void
 */
export default function EditReportCommentsForm({ noteId, unitId, unitName, yearMonth, initialValue = '', onClose, onSaved }) {
  const [resolvedUnitName, setResolvedUnitName] = useState(unitName || '');

  useEffect(() => {
    let cancelled = false;
    if (!resolvedUnitName && unitId) {
      (async () => {
        try {
          const res = await api.get(`/api/units/${unitId}`);
          const data = res?.data ?? res;
          const name = data?.unitName || data?.name || '';
          if (!cancelled) setResolvedUnitName(name);
        } catch {
          // ignore fetch errors; title will just omit name
        }
      })();
    }
    return () => { cancelled = true; };
  }, [unitId]);

  const [commentText, setCommentText] = useState(initialValue || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (submitting) return;

    if (!unitId) throw new Error('unitId is required');
    if (!yearMonth || String(yearMonth).length !== 7) throw new Error('yearMonth must be in YYYY-MM format');
    if (!commentText || String(commentText).trim() === '') throw new Error('Please enter a comment.');

    const nowIso = new Date().toISOString();

    // Payload includes snake_case fields (DB) and camelCase (compat)
    const payload = {
      // identifiers
      unit_id: unitId,
      unitId: unitId,
      unit: `/api/units/${unitId}`,

      // time context
      note_year_month: yearMonth,
      noteYearMonth: yearMonth,
      yearMonth: yearMonth, // some validators expect this camelCase key

      // content
      note_comment: commentText,
      noteComment: commentText,
      comment: commentText, // some validators expect this key
      entry_type: 'report',
      entryType: 'REPORT',

      // audit
      updated_at: nowIso,
      updatedAt: nowIso,
    };

    if (resolvedUnitName && String(resolvedUnitName).trim() !== '') {
      payload.unitName = resolvedUnitName;
      payload.unit_name = resolvedUnitName;
    }

    try {
      setSubmitting(true);
      let res;
      if (noteId) {
        // Edit existing note: API allows PUT (GET, PUT, DELETE). Send full payload.
        res = await api.put(`/api/client_unit_notes/${noteId}`, payload, {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        });
      } else {
        // Create new note
        res = await api.post('/api/client_unit_notes', payload, {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        });
      }
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
      title={`${noteId ? 'Edit' : 'Add'} Comment${resolvedUnitName ? ` for ${resolvedUnitName}` : ''}`}
      onSubmit={handleSubmit}
      onCancel={onClose}
      renderSave
      showCancel
    >
      <div className="form-body">
        <FormLayout.Row label="Comment">
          <textarea
            name="comment"
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