import React, { useMemo, useState } from 'react';
import { Box, Button, MenuItem } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller, FormProvider } from 'react-hook-form';
import dayjs from 'dayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import api from '../../../api';

import RHFTextField from '../../../components/forms/rhf/RHFTextField';
import RHFSelect from '../../../components/forms/rhf/RHFSelect';
import MobileFormScaffold from './MobileFormScaffold';
import useCurrentUserAccess from '../../../hooks/useCurrentUserAccess';

/**
 * MobileCashForm
 *
 * For now this is primarily aimed at supervisors:
 *  - Date (defaults to today, editable)
 *  - Type (dropdown, excludes CashAdvance for supervisors)
 *  - Amount
 *  - Notes
 *
 * Later we can extend it for Admin/Manager to allow choosing Employee,
 * status, etc. The API submission is left as a TODO hook.
 */
export default function MobileCashForm() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const handleRemoveFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };
  const { isSupervisor, isManager, isAdmin, employee } = useCurrentUserAccess();

  const isEmployeeLocked = isSupervisor && !isAdmin && !isManager;

  // All possible types (business rules can be adjusted later)
  const typeOptions = useMemo(
    () => [
      { value: 'GuestPayment', label: 'Pago Huésped' },
      { value: 'CashReturn', label: 'Entrega de Efectivo' },
      { value: 'Expense', label: 'Gasto' },
    ],
    []
  );

  const today = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const defaultValues = useMemo(
    () => ({
      date: today,
      type: 'Expense',
      amount: '',
      notes: '',
      // For future use (admin/manager can choose different employee):
      employeeId: employee?.id || '',
    }),
    [today, typeOptions, employee]
  );

  const methods = useForm({
    defaultValues,
    criteriaMode: 'all',
    mode: 'onSubmit',
  });

  const onSubmit = async (values) => {
    setSubmitting(true);

    // Resolve employeeId:
    // - For supervisors (locked to their own employee), always use session employee.id
    // - For admin/manager, allow selecting employeeId, but fall back to session employee if missing
    const resolvedEmployeeId =
      (isEmployeeLocked && employee?.id)
        ? employee.id
        : (values.employeeId || employee?.id || undefined);

    if (!resolvedEmployeeId) {
      // eslint-disable-next-line no-alert
      alert('No employee is associated with this entry. Please contact admin.');
      setSubmitting(false);
      return;
    }

    const attachments = selectedFiles || [];
    if (attachments.length > 2) {
      alert('You can upload a maximum of 2 files.');
      setSubmitting(false);
      return;
    }

    // Map form values to API payload. The backend still enforces status and
    // derived fields (division/city/costCentre/code) based on the employee.
    const payload = {
      employeeId: resolvedEmployeeId,
      type: values.type,
      amount: values.amount,
      notes: values.notes,
      date: values.date,
    };

    try {
      // Use the shared API client so JWT and defaults are applied consistently
      const formData = new FormData();
      Object.entries(payload).forEach(([key, val]) => formData.append(key, val));
      attachments.forEach((file, idx) => formData.append(`files[${idx}]`, file));
      await api.post('/api/employee-cash-ledger', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // On success, navigate back to the cash list. The list page
      // fetches on mount, so this also ensures an auto-refresh.
      navigate('/m/employee-cash');
    } catch (e) {
      // Axios-style error handling
      // eslint-disable-next-line no-console
      console.error('MobileCashForm submit error:', e);
      let message = 'Failed to save entry';
      if (e.response && e.response.data) {
        const data = e.response.data;
        if (data.error || data.message) {
          message = data.error || data.message;
        }
      }
      // eslint-disable-next-line no-alert
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  // If somehow we have no employee and this is supervisor mode, show a guard.
  if (isEmployeeLocked && !employee?.id) {
    return (
      <MobileFormScaffold
        title="Nuevo registro"
        onBack={() => navigate('/m/employee-cash')}
      >
        <Box sx={{ color: 'text.secondary' }}>
          No employee is associated with your session. Please contact admin.
        </Box>
      </MobileFormScaffold>
    );
  }

  return (
    <FormProvider {...methods}>
      <MobileFormScaffold
        title="Nuevo registro"
        preset="new"
        onBack={() => navigate('/m/employee-cash')}
        onCancel={() => navigate('/m/employee-cash')}
        onSubmit={methods.handleSubmit(onSubmit)}
        saveLabel={submitting ? 'Salvando…' : 'Salvar'}
        cancelLabel="Cancelar"
        submitting={submitting}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Date */}
          <Controller
            name="date"
            control={methods.control}
            render={({ field, fieldState }) => (
              <DatePicker
                label="Fecha"
                value={field.value ? dayjs(field.value, 'YYYY-MM-DD') : null}
                onChange={(newValue) => {
                  const v = newValue ? newValue.format('YYYY-MM-DD') : '';
                  field.onChange(v);
                }}
                format="DD-MM-YYYY"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    error: !!fieldState.error,
                    helperText: fieldState.error?.message,
                  },
                }}
              />
            )}
          />

          {/* TODO (later): Employee select for Admin/Manager.
              For now, supervisor uses the current employee from session. */}
          {!isEmployeeLocked && (isAdmin || isManager) && (
            <RHFSelect name="employeeId" label="Employee">
              {/* Options to be wired later to an API.
                  Placeholder only for now. */}
              <MenuItem value="">Select employee…</MenuItem>
            </RHFSelect>
          )}

          {/* Type */}
          <RHFSelect
            name="type"
            label="Tipo"
            options={typeOptions}
          />

          {/* Amount */}
          <RHFTextField
            name="amount"
            label="Monto"
            placeholder="0.00"
            inputMode="decimal"
          />

          {/* Notes */}
          <RHFTextField
            name="notes"
            label="Notas"
            multiline
            minRows={3}
          />

          {/* Fotos (max 2) */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <label style={{ fontSize: '0.9rem', color: '#555' }}>Fotos (max 2)</label>

            {/* Hidden native input to avoid "Choose files / No file chosen" UI */}
            <input
              id="mobile-cash-files"
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                const imageFiles = files.filter(
                  (file) => file && typeof file.type === 'string' && file.type.startsWith('image/')
                );

                if (imageFiles.length < files.length) {
                  // eslint-disable-next-line no-alert
                  alert('Solo se permiten fotos. Los archivos no válidos fueron ignorados.');
                }

                setSelectedFiles((prev) => {
                  const merged = [...prev, ...imageFiles];
                  if (merged.length > 2) {
                    // eslint-disable-next-line no-alert
                    alert('Máximo 2 fotos. Las fotos extra fueron ignoradas.');
                  }
                  return merged.slice(0, 2);
                });

                // allow re-selecting the same file again later
                try { e.target.value = ''; } catch {}
              }}
            />

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                variant="outlined"
                onClick={() => {
                  try {
                    const el = document.getElementById('mobile-cash-files');
                    if (el) el.click();
                  } catch {}
                }}
              >
                Subir fotos
              </Button>

              <Box sx={{ fontSize: '0.85rem', color: '#666' }}>
                {Array.isArray(selectedFiles) && selectedFiles.length > 0
                  ? `${selectedFiles.length} / 2`
                  : 'Sin fotos'}
              </Box>
            </Box>

            {Array.isArray(selectedFiles) && selectedFiles.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {selectedFiles.map((file, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: '#444',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      padding: '4px 8px',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#c00',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Quitar
                    </button>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </MobileFormScaffold>
    </FormProvider>
  );
}
