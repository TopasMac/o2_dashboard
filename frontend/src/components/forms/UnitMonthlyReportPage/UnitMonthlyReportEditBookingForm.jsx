import React, { useEffect, useState } from 'react';
import api from '../../../api';
import FormLayoutInline from '../../layouts/FormLayoutInline';
import '../../layouts/FormLayoutInline.css';

const normalizePaymentMethod = (val) => {
  const s = (val ?? '').toString().trim().toUpperCase();
  if (['CARD','CASH','PLATFORM','TRANSFER'].includes(s)) return s;
  // common variants
  if (s === 'CREDIT' || s === 'TARJETA') return 'CARD';
  if (s === 'EFECTIVO') return 'CASH';
  if (s === 'AIRBNB' || s === 'PLATAFORMA' || s === 'PLT' || s === 'PLAT') return 'PLATFORM';
  if (s === 'BANK' || s === 'WIRE' || s === 'TRANSFERENCIA') return 'TRANSFER';
  return s || '';
};

const UnitMonthlyReportEditBookingForm = ({ booking: initialBooking, onClose }) => {
  const [booking, setBooking] = useState(initialBooking);
  useEffect(() => {
    if (initialBooking) {
      const pmRaw = initialBooking.paymentMethod ?? initialBooking.bookingPaymentMethod;
      const paymentMethod = normalizePaymentMethod(pmRaw);
      // Only update state if id changed or payment method differs
      if (initialBooking.id !== booking?.id || paymentMethod !== normalizePaymentMethod(booking?.paymentMethod ?? booking?.bookingPaymentMethod)) {
        setBooking({ ...initialBooking, paymentMethod });
      }
    }
  }, [initialBooking]);
  const [activeUnits, setActiveUnits] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      // Normalize decimal separators for money/decimal fields
      const normalizeMoney = (val) => {
        const s = (val ?? '').toString().replace(',', '.').trim();
        if (s === '') return '';
        const n = parseFloat(s);
        return Number.isFinite(n) ? n.toFixed(2) : '';
      };
      const toNumberOrNull = (s) => {
        if (s === '' || s === null || typeof s === 'undefined') return null;
        const n = typeof s === 'number' ? s : parseFloat(s);
        return Number.isFinite(n) ? n : null;
      };

      const payoutNorm = normalizeMoney(booking.payout);
      const cleaningFeeNorm = normalizeMoney(booking.cleaningFee);
      const commissionPercentNorm = normalizeMoney(booking.commissionPercent);
      const roomFeeNorm = normalizeMoney(booking.roomFee); // preserve if exists

      const payout = parseFloat(payoutNorm);
      const roomFee = parseFloat(roomFeeNorm);
      if (booking.status !== 'Cancelled' && Number.isFinite(payout) && Number.isFinite(roomFee) && payout < roomFee) {
        throw new Error('Payout cannot be less than Room Fee.');
      }
      if (new Date(booking.checkOut) < new Date(booking.checkIn)) {
        throw new Error('Check-out date cannot be before Check-in date.');
      }

      // Remove non-payload UI fields
      const { meterReadings, meterReadingSegments, ...cleanBooking } = booking || {};

      // Resolve unit from suggestions list if the user typed a name
      const selectedUnit = activeUnits.find(
        (u) => u.id === booking.unitId || u.unit_name === booking.unitName
      );

      const pmRaw = (booking.paymentMethod ?? booking.bookingPaymentMethod ?? '').toString().trim();
      const paymentMethodNorm = pmRaw ? pmRaw.toUpperCase() : null;

      const payload = {
        ...cleanBooking, // keep unchanged fields
        // normalized editable fields
        payout: toNumberOrNull(payoutNorm),
        cleaningFee: toNumberOrNull(cleaningFeeNorm),
        commissionPercent: toNumberOrNull(commissionPercentNorm),
        // keep roomFee if present in booking (even if not edited here)
        roomFee: toNumberOrNull(roomFeeNorm),
        // unit identity
        unitId: selectedUnit ? selectedUnit.id : booking.unitId,
        unitName: selectedUnit ? selectedUnit.unit_name : booking.unitName || '',
        paymentMethod: paymentMethodNorm,
      };

      // If cancelled, enforce zero monetary fields in the payload
      if (booking.status === 'Cancelled') {
        payload.payout = 0;
        if (payload.roomFee != null) payload.roomFee = 0;
        if (payload.cleaningFee != null) payload.cleaningFee = 0;
      }

      const res = await api.put(`/api/bookings/${booking.id}`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      try { typeof onClose === 'function' && onClose(); } catch {}
      return res;
    } catch (err) {
      const apiMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        (typeof err?.response?.data === 'string' ? err.response.data : null) ||
        err?.message ||
        'Failed to update booking.';
      throw new Error(apiMessage);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    api
      .get('/api/unit-list/active?pagination=false')
      .then((response) => setActiveUnits(response.data))
      .catch((err) => console.error('Error fetching active units:', err));
  }, []);

  // Helper to calculate status based on check-in and check-out dates
  const calculateStatus = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return '';
    const now = new Date();
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    if (now < inDate) return 'Upcoming';
    if (now >= inDate && now <= outDate) return 'Currently hosting';
    if (now > outDate) return 'Past guest';
    return '';
  };

  if (!booking) return <div>Loading...</div>;

  return (
    <FormLayoutInline
      title={`Edit Reservation for ${booking.guestName || ''}`}
      onSubmit={handleSubmit}
      onCancel={onClose}
    >
      <div className="form-content">
        {/* Unit */}
        <div className="field-with-suggestions form-row">
          <label>Unit:</label>
          <div className="input-wrapper">
            <input
              type="text"
              value={
                booking.unitName || activeUnits.find((u) => u.id === booking.unitId)?.unit_name || ''
              }
              onChange={(e) => {
                setBooking({ ...booking, unitName: e.target.value });
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
              placeholder="Start typing unit name..."
            />
            {showSuggestions && (booking.unitName || '') && (
              <ul className="suggestions-list">
                {activeUnits
                  .filter((u) =>
                    u.unit_name.toLowerCase().includes((booking.unitName || '').toLowerCase())
                  )
                  .map((unit) => (
                    <li
                      key={unit.id}
                      onMouseDown={() => setBooking({ ...booking, unitId: unit.id, unitName: unit.unit_name })}
                      className="suggestion-item"
                    >
                      {unit.unit_name}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="form-row">
          <label>Status:</label>
          <select
            value={booking.status}
            onChange={(e) => {
              const next = e.target.value;
              if (next === 'Cancelled' && booking.status !== 'Cancelled') {
                if (!window.confirm('Are you sure you want to cancel?')) return;
                setBooking({
                  ...booking,
                  status: next,
                  payout: 0,
                  roomFee: booking.roomFee != null ? 0 : booking.roomFee,
                  cleaningFee: booking.cleaningFee != null ? 0 : booking.cleaningFee,
                });
                return;
              }
              if (next === 'Active' && booking.status === 'Cancelled') {
                const recalculated = calculateStatus(booking.checkIn, booking.checkOut) || 'Upcoming';
                setBooking({ ...booking, status: recalculated });
                return;
              }
              setBooking({ ...booking, status: next });
            }}
          >
            {booking.status !== 'Cancelled' && (
              <option value={booking.status}>{booking.status}</option>
            )}
            <option value="Cancelled">Cancelled</option>
            {booking.status === 'Cancelled' && <option value="Active">Active</option>}
          </select>
        </div>

        {/* Guest Name */}
        <div className="form-row">
          <label>Guest Name:</label>
          <input
            type="text"
            value={booking.guestName || ''}
            onChange={(e) => setBooking({ ...booking, guestName: e.target.value })}
          />
        </div>

        {/* Check-in */}
        <div className="form-row">
          <label>Check-in:</label>
          <input
            type="date"
            value={booking.checkIn ? booking.checkIn.split('T')[0] : ''}
            onChange={(e) => {
              const newCheckIn = e.target.value;
              const newStatus =
                booking.status !== 'Cancelled' ? calculateStatus(newCheckIn, booking.checkOut) : booking.status;
              setBooking({ ...booking, checkIn: newCheckIn, status: newStatus });
            }}
          />
        </div>

        {/* Check-out */}
        <div className="form-row">
          <label>Check-out:</label>
          <input
            type="date"
            value={booking.checkOut ? booking.checkOut.split('T')[0] : ''}
            onChange={(e) => {
              const newCheckOut = e.target.value;
              const newStatus =
                booking.status !== 'Cancelled' ? calculateStatus(booking.checkIn, newCheckOut) : booking.status;
              setBooking({ ...booking, checkOut: newCheckOut, status: newStatus });
            }}
          />
        </div>

        {/* Payout */}
        <div className="form-row">
          <label>Payout:</label>
          <input
            type="number"
            step="0.01"
            value={
              booking.payout === '' || booking.payout === null || typeof booking.payout === 'undefined'
                ? ''
                : booking.payout
            }
            onFocus={() => setBooking({ ...booking, payout: '' })}
            onChange={(e) => setBooking({ ...booking, payout: e.target.value === '' ? '' : e.target.value })}
          />
        </div>

        {/* Payment Method */}
        <div className="form-row">
          <label>Payment Method:</label>
          <select
            value={normalizePaymentMethod(booking.paymentMethod ?? booking.bookingPaymentMethod)}
            onChange={(e) => setBooking({ ...booking, paymentMethod: e.target.value })}
          >
            <option value="">Select…</option>
            <option value="CARD">Card</option>
            <option value="CASH">Cash</option>
            <option value="PLATFORM">Platform</option>
            <option value="TRANSFER">Transfer</option>
          </select>
        </div>

        {/* Cleaning Fee */}
        <div className="form-row">
          <label>Cleaning Fee:</label>
          <input
            type="number"
            step="0.01"
            value={
              booking.cleaningFee === '' || booking.cleaningFee === null || typeof booking.cleaningFee === 'undefined'
                ? ''
                : booking.cleaningFee
            }
            onFocus={() => setBooking({ ...booking, cleaningFee: '' })}
            onChange={(e) =>
              setBooking({ ...booking, cleaningFee: e.target.value === '' ? '' : e.target.value })
            }
          />
        </div>

        {/* O2 Commission (commission_percent) */}
        <div className="form-row">
          <label>O2 Commission (%):</label>
          <input
            type="number"
            step="0.01"
            value={
              booking.commissionPercent === '' ||
              booking.commissionPercent === null ||
              typeof booking.commissionPercent === 'undefined'
                ? ''
                : booking.commissionPercent
            }
            onChange={(e) =>
              setBooking({ ...booking, commissionPercent: e.target.value === '' ? '' : e.target.value })
            }
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </FormLayoutInline>
  );
};

export default UnitMonthlyReportEditBookingForm;
