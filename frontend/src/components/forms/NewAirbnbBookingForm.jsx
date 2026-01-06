import React, { useState, useEffect } from 'react';
import api from '../../api';

function NewAirbnbBookingForm() {
  const [formData, setFormData] = useState({
    booking_date: '',
    confirmation_code: '',
    guest_name: '',
    unit_name: '',
    guests: '',
    check_in: '',
    check_out: '',
    payout: '',
  });

  const [unitOptions, setUnitOptions] = useState([]);

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const response = await api.get('/api/units?status=active&pagination=false');
        const data = response.data;
        setUnitOptions(data);
      } catch (error) {
        console.error('Error fetching unit options:', error);
      }
    };
    fetchUnits();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Normalize decimal separator for payout
    const normalizedPayoutStr = (formData.payout ?? '').toString().replace(',', '.').trim();

    const dataToSend = {
      ...formData,
      payout: normalizedPayoutStr === '' ? '' : String(parseFloat(normalizedPayoutStr).toFixed(2)),
      source: "Airbnb",
    };

    try {
      const response = await api.post('/api/bookings', dataToSend);
      if (response.status !== 200 && response.status !== 201) {
        throw new Error('Failed to submit booking');
      }

      // Clear form or handle success as needed
      setFormData({
        booking_date: '',
        confirmation_code: '',
        guest_name: '',
        unit_name: '',
        guests: '',
        check_in: '',
        check_out: '',
        payout: '',
      });
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date)) return '';
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString(undefined, options);
  };

  return (
    <FormLayout title="New Airbnb Booking" onSubmit={handleSubmit}>
      <div>
        <label>
          Booking Date:
          <input
            type="date"
            name="booking_date"
            value={formData.booking_date}
            onChange={handleChange}
            required
          />
        </label>
      </div>
      <div>
        <label>
          Confirmation Code:
          <input
            type="text"
            name="confirmation_code"
            value={formData.confirmation_code}
            onChange={handleChange}
            required
          />
        </label>
      </div>
      <div>
        <label>
          Guest Name:
          <input
            type="text"
            name="guest_name"
            value={formData.guest_name}
            onChange={handleChange}
            required
          />
        </label>
      </div>
      <div>
        <label>
          Listing Name:
          <select
            name="unit_name"
            value={formData.unit_name}
            onChange={handleChange}
            required
          >
            <option value="">Select a unit</option>
            {unitOptions.map((unit) => (
              <option key={unit.id} value={unit.unit_id}>
                {unit.unit_id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <label>
          Guests:
          <input
            type="number"
            name="guests"
            value={formData.guests}
            onChange={handleChange}
            required
            min="1"
          />
        </label>
      </div>
      <div>
        <label>
          Check In (DD/MM/YYYY):
          <input
            type="date"
            name="check_in"
            value={formData.check_in}
            onChange={handleChange}
            required
          />
          <span>{formatDateForDisplay(formData.check_in)}</span>
        </label>
      </div>
      <div>
        <label>
          Check Out (DD/MM/YYYY):
          <input
            type="date"
            name="check_out"
            value={formData.check_out}
            onChange={handleChange}
            required
          />
          <span>{formatDateForDisplay(formData.check_out)}</span>
        </label>
      </div>
      <div>
        <label>
          Payout:
          <input
            type="number"
            name="payout"
            value={formData.payout}
            onChange={handleChange}
            required
            min="0"
            step="0.01"
          />
        </label>
      </div>
      <button type="submit">Submit Booking</button>
    </FormLayout>
  );
}

export default NewAirbnbBookingForm;
