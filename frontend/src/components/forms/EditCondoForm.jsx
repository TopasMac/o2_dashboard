import React, { useState, useEffect } from 'react';
import { useMediaQuery } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { BANKS } from '../../constants/banks';
import FormLayout from '../layouts/FormLayout';

const EditCondoForm = ({ id, onCondoUpdated, onCancel }) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const navigate = useNavigate();
  const [condo, setCondo] = useState(null);
  const [formData, setFormData] = useState({
    city: '',
    doorCode: '',
    notes: '',
    googleMaps: '',
    hoaBank: '',
    hoaAccountName: '',
    hoaAccountNr: '',
    hoaEmail: '',
    hoaDueDay: '',
    buildingCode: '',
    googleMapsLink: ''
  });

  useEffect(() => {
    api.get(`/api/condos/${id}`)
      .then(response => {
        setCondo(response.data);
        setFormData({
          city: response.data.city || '',
          doorCode: response.data.doorCode || '',
          notes: response.data.notes || '',
          googleMaps: response.data.googleMaps || '',
          hoaBank: response.data.hoaBank || '',
          hoaAccountName: response.data.hoaAccountName || '',
          hoaAccountNr: response.data.hoaAccountNr || '',
          hoaEmail: response.data.hoaEmail || '',
          hoaDueDay: response.data.hoaDueDay || '',
          buildingCode: response.data.buildingCode || '',
          googleMapsLink: response.data.googleMapsLink || ''
        });
      });
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      city: formData.city,
      doorCode: formData.doorCode,
      notes: formData.notes,
      googleMaps: formData.googleMaps,
      hoaBank: formData.hoaBank,
      hoaAccountName: formData.hoaAccountName,
      hoaAccountNr: formData.hoaAccountNr,
      hoaEmail: formData.hoaEmail,
      hoaDueDay: parseInt(formData.hoaDueDay, 10) || null,
      buildingCode: formData.buildingCode,
      googleMapsLink: formData.googleMapsLink
    };
    // Return the promise so FormLayout can await and render banner/toast on error
    return api.put(`/api/condos/${id}`, payload)
      .then(() => {
        if (onCondoUpdated) {
          try { onCondoUpdated(); } catch {}
        } else {
          navigate('/condos');
        }
      })
      .catch((err) => {
        console.error('Failed to update condo', err);
        const apiMessage =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          (typeof err?.response?.data === 'string' ? err.response.data : null) ||
          err?.message ||
          'Failed to update condo';
        // Rethrow so FormLayout shows the banner + toast
        throw new Error(apiMessage);
      });
  };

  if (!condo) return <div>Loading...</div>;

  return (
    <FormLayout title={`Edit Condo #${condo.id}: ${condo.condoName}`} onSubmit={handleSubmit}>
      <div className="form-row">
        <label>Condo Name:</label>
        <input
          type="text"
          name="condoName"
          value={condo.condoName}
          disabled
          style={{ backgroundColor: '#f0f0f0' }}
        />
      </div>
      <div className="form-row">
        <label>City:</label>
        <select
          name="city"
          value={formData.city}
          disabled
          style={{ backgroundColor: '#f0f0f0' }}
        >
          <option value="">Select City</option>
          <option value="Playa del Carmen">Playa del Carmen</option>
          <option value="Tulum">Tulum</option>
        </select>
      </div>
      <div className="form-row">
        <label>Door Code:</label>
        <input type="text" name="doorCode" value={formData.doorCode} onChange={handleChange} />
      </div>
      <div className="form-row">
        <label>Google Maps:</label>
        <input type="text" name="googleMaps" value={formData.googleMaps} onChange={handleChange} />
      </div>
      <div className="form-row">
        <label>HOA Bank:</label>
        <select name="hoaBank" value={formData.hoaBank} onChange={handleChange}>
          <option value="">Select Bank</option>
          {BANKS.sort().map((bank) => (
            <option key={bank} value={bank}>{bank}</option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>HOA Account Name:</label>
        <input type="text" name="hoaAccountName" value={formData.hoaAccountName} onChange={handleChange} />
      </div>
      <div className="form-row">
        <label>HOA Account Number:</label>
        <input type="text" name="hoaAccountNr" value={formData.hoaAccountNr} onChange={handleChange} />
      </div>
      <div className="form-row">
        <label>HOA Email:</label>
        <input type="email" name="hoaEmail" value={formData.hoaEmail} onChange={handleChange} />
      </div>
      <div className="form-row">
        <label>HOA Due Day:</label>
        <input type="number" name="hoaDueDay" value={formData.hoaDueDay} onChange={handleChange} />
      </div>
      <div className="form-row">
        <label>Building Code:</label>
        <input type="text" name="buildingCode" value={formData.buildingCode} onChange={handleChange} />
      </div>
      <div className="form-row">
        <label>Google Maps Link:</label>
        <input type="text" name="googleMapsLink" value={formData.googleMapsLink} onChange={handleChange} />
      </div>
      <div className="form-row">
        <label>Notes:</label>
        <textarea name="notes" value={formData.notes} onChange={handleChange} />
      </div>
      <div className="form-actions">
        <div className="form-actions-left">
          <button type="submit" className="save-button">Save</button>
          <button
            type="button"
            className="cancel-button"
            onClick={(e) => {
              e.preventDefault();
              if (onCancel) return onCancel();
              if (onCondoUpdated) return onCondoUpdated();
              return navigate('/condos');
            }}
          >
            Cancel
          </button>
        </div>
        {!isMobile && (
          <div className="form-actions-right">
            <button
              type="button"
              className="delete-button"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this condo?')) {
                  api.delete(`/api/condos/${id}`).then(() => {
                    if (onCondoUpdated) {
                      try { onCondoUpdated(); } catch {}
                    } else {
                      navigate('/condos');
                    }
                  }).catch((err) => {
                    console.error('Failed to delete condo', err);
                    throw err;
                  });
                }
              }}
            >
              Delete Condo
            </button>
          </div>
        )}
      </div>
    </FormLayout>
  );
};

export default EditCondoForm;