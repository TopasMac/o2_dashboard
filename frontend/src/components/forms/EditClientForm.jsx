import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { mergePatch } from '../../api';
import FormLayout from '../layouts/FormLayout';
import { BANKS } from '../../constants/banks';

function EditClientForm({ clientId, onClose }) {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const id = clientId || routeId;
  const [formData, setFormData] = useState({
    name: '',
    startingDate: '',
    nationality: '',
    dob: '',
    phone: '',
    email: '',
    bankName: '',
    bankOwner: '',
    bankAccount: '',
    comments: '',
    language: '',
  });

  useEffect(() => {
    console.log('Fetching client with ID:', id);
    api.get(`/api/clients/${id}?pagination=false`)
      .then((response) => {
        const data = response.data;
        console.log('Fetched client data:', data);
        console.log('bankName:', data.bankName);
        if (data) {
          setFormData({
            name: data.name || '',
            startingDate: data.startingDate?.slice(0, 10) || '',
            nationality: data.nationality || '',
            dob: data.dob?.slice(0, 10) || '',
            phone: data.phone || '',
            email: data.email || '',
            bankName: data.bankName || '',
            bankOwner: data.bankOwner || '',
            bankAccount: data.bankAccount || '',
            comments: data.comments || '',
            language: data.language || '',
          });
        } else {
          console.error('Client data not found');
          console.error(data);
        }
      })
      .catch((error) => console.error('Error fetching client data:', error));
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalizedData = {
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
      language: formData.language || null,
      comments: formData.comments || null,
    };

    console.log('Payload being sent to backend:', normalizedData);

    // Return the promise so FormLayout can await it and show banner/toast on errors
    return mergePatch(`/api/clients/${id}`, normalizedData)
      .then((response) => {
        console.log('Response from backend:', response);
        if (response.status === 200 || response.status === 201) {
          if (onClose) {
            try { onClose(); } catch {}
          } else {
            navigate('/clients');
          }
        } else {
          console.error('Update failed:', response);
          throw new Error('Update failed');
        }
      })
      .catch((err) => {
        console.error('Error submitting form:', err);
        const apiMessage =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          (typeof err?.response?.data === 'string' ? err.response.data : null) ||
          err?.message ||
          'Failed to update client';
        // Rethrow so FormLayout.jsx shows the banner + toast
        throw new Error(apiMessage);
      });
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this client?')) {
      return api.delete(`/api/clients/${id}`)
        .then(() => {
          if (onClose) {
            try { onClose(); } catch {}
          } else {
            navigate('/clients');
          }
        })
        .catch((error) => {
          console.error('Error deleting client:', error);
          throw error;
        });
    }
  };

  return (
    <FormLayout title="Edit Client" onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="name">Name:</label>
        <input id="name" name="name" value={formData.name} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label htmlFor="language">Language:</label>
        <select id="language" name="language" value={formData.language} onChange={handleChange}>
          <option value="">Select Language</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="startingDate">Starting Date:</label>
        <input id="startingDate" type="date" name="startingDate" value={formData.startingDate} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label htmlFor="nationality">Nationality:</label>
        <input id="nationality" name="nationality" value={formData.nationality} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label htmlFor="dob">Date of Birth:</label>
        <input id="dob" type="date" name="dob" value={formData.dob} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label htmlFor="phone">Phone:</label>
        <input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label htmlFor="email">Email:</label>
        <input id="email" name="email" value={formData.email} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label htmlFor="bankName">Bank Name:</label>
        <select id="bankName" name="bankName" value={formData.bankName} onChange={handleChange}>
          <option value="">Select Bank</option>
          {BANKS.sort().map((bank) => (
            <option key={bank} value={bank}>{bank}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="bankOwner">Bank Owner:</label>
        <input id="bankOwner" name="bankOwner" value={formData.bankOwner} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label htmlFor="bankAccount">Bank Account:</label>
        <input id="bankAccount" name="bankAccount" value={formData.bankAccount} onChange={handleChange} />
      </div>

      <div className="form-row">
        <label htmlFor="comments">Comments:</label>
        <input id="comments" name="comments" value={formData.comments} onChange={handleChange} />
      </div>

      <div className="form-actions">
        <div className="form-actions-left">
          <button type="submit" className="btn-primary">Save</button>
          <button
            type="button"
            className="btn-secondary"
            onClick={(e) => {
              e.preventDefault();
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
        <div className="form-actions-right">
          <button
            type="button"
            className="btn-danger"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </FormLayout>
  );
}

export default EditClientForm;