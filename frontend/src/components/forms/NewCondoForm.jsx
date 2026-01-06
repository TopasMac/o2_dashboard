import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { BANKS } from '../../constants/banks';
import FormLayout from '../layouts/FormLayout';

function NewCondoForm({ onCondoAdded, onClose }) {
  const [formData, setFormData] = useState({
    condoName: '',
    city: '',
    doorCode: '',
    notes: '',
    googleMaps: '',
    hoaBank: '',
    hoaAccountName: '',
    hoaAccountNr: '',
    hoaEmail: '',
    hoaDueDay: ''
  });

  const [condoNames, setCondoNames] = useState([]);
  const [existingCondoError, setExistingCondoError] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/condos').then((res) => {
      const condos = res.data['hydra:member'] || res.data;
      const names = Array.isArray(condos)
        ? condos.map((condo) => condo.condoName)
        : [];
      setCondoNames(names);
    });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (name === 'condoName') {
      setExistingCondoError(condoNames.includes(value));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (existingCondoError) {
      alert('You cannot submit because this condo name already exists.');
      return;
    }
    try {
      const payload = {
        ...formData,
        hoaDueDay: formData.hoaDueDay ? parseInt(formData.hoaDueDay, 10) : null,
        doorCode: formData.doorCode || null,
        googleMaps: formData.googleMaps || null,
        hoaBank: formData.hoaBank || null,
        hoaAccountName: formData.hoaAccountName || null,
        hoaAccountNr: formData.hoaAccountNr || null,
        hoaEmail: formData.hoaEmail || null,
        notes: formData.notes || null,
      };
      const response = await api.post('/api/condos', payload);
      if (response.status !== 200 && response.status !== 201) {
        throw new Error('Failed to create condo');
      }
      alert('Condo created successfully!');
      setFormData({
        condoName: '',
        city: '',
        doorCode: '',
        notes: '',
        googleMaps: '',
        hoaBank: '',
        hoaAccountName: '',
        hoaAccountNr: '',
        hoaEmail: '',
        hoaDueDay: ''
      });
      setExistingCondoError(false);
      if (onCondoAdded) {
        onCondoAdded();
      }
    } catch (error) {
      console.error(error);
      alert('Error creating condo');
    }
  };

  return (
    <FormLayout title="Add New Condo" onSubmit={handleSubmit}>
      {/* Fields follow FormLayout.css expectations: .form-row with label + input stacked */}
      <div className="form-row">
        <label htmlFor="condoName">Condo Name</label>
        <input
          id="condoName"
          type="text"
          name="condoName"
          list="condoNameOptions"
          value={formData.condoName}
          onChange={handleChange}
          required
        />
        <datalist id="condoNameOptions">
          {condoNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {existingCondoError && (
          <p style={{ color: 'red', marginTop: 4 }}>This condo name already exists</p>
        )}
      </div>

      <div className="form-row">
        <label htmlFor="city">City</label>
        <select
          id="city"
          name="city"
          value={formData.city}
          onChange={handleChange}
          required
        >
          <option value="">Select City</option>
          <option value="Playa del Carmen">Playa del Carmen</option>
          <option value="Tulum">Tulum</option>
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="googleMaps">Google Maps</label>
        <input
          id="googleMaps"
          type="text"
          name="googleMaps"
          value={formData.googleMaps}
          onChange={handleChange}
        />
      </div>

      <div className="form-row">
        <label htmlFor="doorCode">Door Code</label>
        <input
          id="doorCode"
          type="text"
          name="doorCode"
          value={formData.doorCode}
          onChange={handleChange}
        />
      </div>

      <div className="form-row">
        <label htmlFor="hoaEmail">HOA Email</label>
        <input
          id="hoaEmail"
          type="text"
          name="hoaEmail"
          value={formData.hoaEmail}
          onChange={handleChange}
        />
      </div>

      <div className="form-row">
        <label htmlFor="hoaBank">HOA Bank</label>
        <select
          id="hoaBank"
          name="hoaBank"
          value={formData.hoaBank}
          onChange={handleChange}
        >
          <option value="">Select Bank</option>
          {BANKS.sort().map((bank) => (
            <option key={bank} value={bank}>{bank}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="hoaAccountName">HOA Account Name</label>
        <input
          id="hoaAccountName"
          type="text"
          name="hoaAccountName"
          value={formData.hoaAccountName}
          onChange={handleChange}
        />
      </div>

      <div className="form-row">
        <label htmlFor="hoaAccountNr">HOA Account Number</label>
        <input
          id="hoaAccountNr"
          type="text"
          name="hoaAccountNr"
          value={formData.hoaAccountNr}
          onChange={handleChange}
        />
      </div>

      <div className="form-row">
        <label htmlFor="hoaDueDay">HOA Due Day</label>
        <input
          id="hoaDueDay"
          type="number"
          name="hoaDueDay"
          value={formData.hoaDueDay}
          onChange={handleChange}
        />
      </div>

      <div className="form-row">
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={4}
        />
      </div>

      {/* Actions aligned by .form-actions */}
      <div className="form-actions">
        <div className="form-actions-left">
          <button type="submit" className="btn btn-primary">Submit</button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setFormData({
                condoName: '',
                city: '',
                doorCode: '',
                notes: '',
                googleMaps: '',
                hoaBank: '',
                hoaAccountName: '',
                hoaAccountNr: '',
                hoaEmail: '',
                hoaDueDay: ''
              });
              setExistingCondoError(false);
              if (typeof onClose === 'function') {
                onClose();
              }
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </FormLayout>
  );
}

export default NewCondoForm;