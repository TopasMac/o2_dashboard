import FormLayout from '../layouts/FormLayout';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { BANKS } from '../../constants/banks';

const ClientForm = ({ onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    language: '',
    startingDate: '',
    nationality: '',
    dob: '',
    phone: '',
    email: '',
    bankName: '',
    bankOwner: '',
    bankAccount: '',
    comments: '',
  });

  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const payload = {
      ...formData,
      startingDate: formData.startingDate
        ? new Date(formData.startingDate + 'T12:00:00').toISOString().split('T')[0]
        : null,
      dob: formData.dob
        ? new Date(formData.dob + 'T12:00:00').toISOString().split('T')[0]
        : null,
      bankName: formData.bankName || null,
      bankOwner: formData.bankOwner || null,
      bankAccount: formData.bankAccount || null,
      phone: formData.phone || null,
      email: formData.email || null,
      nationality: formData.nationality || null,
      comments: formData.comments || null,
      language: formData.language || null,
    };

    console.log("Submitting client payload:", payload);

    try {
      // return the promise so FormLayout can await and handle errors
      return api.post('/api/clients', payload)
        .then((response) => {
          if (response.status === 201 || response.status === 200) {
            if (onClose) {
              try { onClose(); } catch {}
            } else {
              navigate('/clients');
            }
          }
        })
        .catch((err) => {
          console.error('Failed to create client', err);
          const apiMessage =
            err?.response?.data?.detail ||
            err?.response?.data?.message ||
            (typeof err?.response?.data === 'string' ? err.response.data : null) ||
            err?.message ||
            'Failed to create client';
          // Rethrow so FormLayout.jsx shows the banner + toast
          throw new Error(apiMessage);
        });
    } catch (error) {
      // In case something throws synchronously before the promise
      const apiMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to create client';
      throw new Error(apiMessage);
    }
  };

  return (
    <FormLayout title="Add New Client" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>Name:</label>
        <input type="text" name="name" value={formData.name} onChange={handleChange} required />
      </div>

      <div className="form-row">
        <label>Language:</label>
        <select name="language" value={formData.language} onChange={handleChange}>
          <option value="">Select Language</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
        </select>
      </div>

      <div className="form-row">
        <label>Starting Date:</label>
        <input type="date" name="startingDate" value={formData.startingDate} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label>Nationality:</label>
        <input type="text" name="nationality" value={formData.nationality} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label>Date of Birth:</label>
        <input type="date" name="dob" value={formData.dob} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label>Phone:</label>
        <input type="text" name="phone" value={formData.phone} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label>Email:</label>
        <input type="email" name="email" value={formData.email} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label>Bank Name:</label>
        <select name="bankName" value={formData.bankName} onChange={handleChange}>
          <option value="">Select Bank</option>
          {BANKS.sort().map((bank) => (
            <option key={bank} value={bank}>{bank}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label>Bank Owner:</label>
        <input type="text" name="bankOwner" value={formData.bankOwner} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label>Bank Account:</label>
        <input type="text" name="bankAccount" value={formData.bankAccount} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label>Comments:</label>
        <textarea name="comments" value={formData.comments} onChange={handleChange}></textarea>
      </div>

      <div className="form-actions">
        <div className="form-actions-left">
          <button type="submit" className="btn btn-primary">Save Client</button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (typeof onClose === 'function') {
                try { onClose(); } catch {}
              } else {
                navigate('/clients');
              }
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </FormLayout>
  );
};

export default ClientForm;