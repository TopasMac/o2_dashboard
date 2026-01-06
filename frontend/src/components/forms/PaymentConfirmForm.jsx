import React, { useState, useEffect } from 'react';
import FormLayout from '../layouts/FormLayout';
import '../layouts/FormLayout.css';

/**
 * PaymentConfirmForm
 * Props:
 *  - booking: { id, paymentNote?, notes? }
 *  - onSubmit: (note: string) => void
 *  - onClose: () => void
 */
export default function PaymentConfirmForm({ booking, onSubmit, onClose }) {
  const initial = (booking?.paymentNote ?? booking?.notes ?? '').trim();
  const [note, setNote] = useState(initial);
  const [paymentMethod, setPaymentMethod] = useState('');

  useEffect(() => {
    setNote((booking?.paymentNote ?? booking?.notes ?? '').trim());
  }, [booking?.paymentNote, booking?.notes]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!note || !note.trim()) {
      throw new Error('Please add a comment');
    }
    if (!paymentMethod) {
      throw new Error('Please add payment method');
    }
    return onSubmit?.({ note: note.trim(), paymentMethod });
  };

  return (
    <FormLayout title="Confirm Payment" onSubmit={handleSubmit} onCancel={onClose}>
      <div className="form-content">
        <div className="form-row">
          <label htmlFor="payment-method">Payment Method</label>
          <select
            id="payment-method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            required
          >
            <option value="">-- Select --</option>
            <option value="Card">Card</option>
            <option value="Cash">Cash</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="payment-note">Notes</label>
          <textarea
            id="payment-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How/when was the payment made?"
            rows={5}
            required
          />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">Save</button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </FormLayout>
  );
}