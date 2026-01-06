import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Box, TextField, MenuItem, Typography, IconButton } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import api from '../../../api';
import MobileFormScaffold from './MobileFormScaffold';
import useCurrentUserAccess from '../../../hooks/useCurrentUserAccess';

import O2ConfirmDialogMobile from '../mobileComponents/O2ConfirmDialogMobile';

export default function MobileCashEditForm() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdminManager, isSupervisor } = useCurrentUserAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [entry, setEntry] = useState(null);
  const [form, setForm] = useState({
    date: null,
    type: 'Expense',
    amount: '',
    notes: '',
    adminComment: '',
    status: 'Pending',
  });
  const [previewUrl, setPreviewUrl] = useState(null);
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [attachmentsToRemove, setAttachmentsToRemove] = useState([]);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isPlainSupervisor = isSupervisor && !isAdminManager;
  const isRejectedViewOnly = !isAdminManager && entry && entry.status === 'Rejected';
  const isReadOnly = isRejectedViewOnly || (isPlainSupervisor && entry && entry.status === 'Approved');

  useEffect(() => {
    async function fetchEntry() {
      let entryData = null;
      if (location.state && location.state.entry) {
        entryData = location.state.entry;
      } else {
        try {
          const res = await api.get(`/api/employee-cash-ledger/${id}`);
          // API returns { success: true, row: { ... } }
          entryData = res.data && res.data.row ? res.data.row : null;
        } catch (error) {
          // handle error, maybe show a message or navigate back
          entryData = null;
        }
      }

      function normalizeType(v) {
        if (!v) return v;
        const s = String(v).trim();
        if (s === 'Cash Return') return 'CashReturn';
        if (s === 'Guest Payment') return 'GuestPayment';
        if (s === 'CashReturn' || s === 'GuestPayment' || s === 'Expense') return s;
        return s;
      }

      if (entryData) {
        setEntry(entryData);
        setForm({
          date: dayjs(
            entryData.date ||
              (entryData.createdAt ? entryData.createdAt.substring(0, 10) : null)
          ),
          type: normalizeType(entryData.type) || 'Expense',
          amount:
            entryData.amount !== undefined && entryData.amount !== null
              ? String(entryData.amount)
              : '',
          notes: entryData.notes || '',
          adminComment: entryData.adminComment || '',
          status: entryData.status || 'Pending',
        });
      }
      setLoading(false);
    }
    fetchEntry();
  }, [id, location.state]);

  function handleChange(field) {
    return (event) => {
      setForm((f) => ({ ...f, [field]: event.target.value }));
    };
  }

  function handleDateChange(newDate) {
    setForm((f) => ({ ...f, date: newDate }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const basePayload = {
        date: form.date ? form.date.format('YYYY-MM-DD') : null,
        type: form.type,
        amount: form.amount === '' ? null : parseFloat(form.amount),
        notes: form.notes,
      };
      if (attachmentsToRemove && attachmentsToRemove.length > 0) {
        basePayload.attachmentsToRemove = attachmentsToRemove;
      }

      if (isAdminManager) {
        basePayload.status = form.status;
      } else if (isSupervisor) {
        basePayload.status = entry?.status || 'Pending';
      }

      const hasFiles = !!file1 || !!file2;

      if (hasFiles) {
        const formData = new FormData();
        Object.entries(basePayload).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, value);
          }
        });
        if (attachmentsToRemove && attachmentsToRemove.length > 0) {
          attachmentsToRemove.forEach((id) => {
            formData.append('attachmentsToRemove[]', id);
          });
        }
        if (file1) {
          formData.append('files[]', file1);
        }
        if (file2) {
          formData.append('files[]', file2);
        }
        // Use POST with method override so PHP/Symfony can populate $_FILES
        formData.append('_method', 'PUT');
        await api.post(`/api/employee-cash-ledger/${id}`, formData);
      } else {
        await api.put(`/api/employee-cash-ledger/${id}`, basePayload);
      }

      navigate('/m/employee-cash', { state: { reloadKey: Date.now() } });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    setDeleting(true);
    try {
      await api.delete(`/api/employee-cash-ledger/${id}`);
      navigate('/m/employee-cash', { state: { reloadKey: Date.now() } });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <MobileFormScaffold
        title="Editar Transaccion"
        footer={
          <div
            className="form-actions"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (!isReadOnly) setConfirmDeleteOpen(true);
                }}
                disabled={isReadOnly || deleting || saving}
                style={
                  isReadOnly
                    ? {
                        opacity: 0.45,
                        filter: 'grayscale(1)',
                        cursor: 'not-allowed',
                      }
                    : undefined
                }
              >
                Eliminar
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(-1)}
                disabled={saving || deleting}
              >
                Cancelar
              </button>

              <button
                type="submit"
                form="mobile-cash-edit-form"
                className="btn btn-primary"
                disabled={isReadOnly || saving || deleting}
                style={
                  isReadOnly
                    ? {
                        opacity: 0.45,
                        filter: 'grayscale(1)',
                        cursor: 'not-allowed',
                      }
                    : undefined
                }
              >
                Salvar
              </button>
            </div>
          </div>
        }
      >
        {loading ? (
          <Typography>Loading...</Typography>
        ) : (
          <Box id="mobile-cash-edit-form" component="form" onSubmit={handleSubmit} noValidate>
            <DatePicker
              label="Fecha"
              value={form.date}
              onChange={handleDateChange}
              format="DD-MM-YYYY"
              slotProps={{
                textField: {
                  fullWidth: true,
                  margin: 'normal',
                  disabled: isReadOnly || saving || deleting,
                },
              }}
            />
            <TextField
              select
              label="Tipo"
              value={form.type}
              onChange={handleChange('type')}
              fullWidth
              margin="normal"
              disabled={isReadOnly || saving || deleting}
            >
              <MenuItem value="GuestPayment">Pago Huésped</MenuItem>
              <MenuItem value="CashReturn">Entrega de Efectivo</MenuItem>
              <MenuItem value="Expense">Gasto</MenuItem>
            </TextField>
            <TextField
              label="Monto"
              type="number"
              value={form.amount}
              onChange={handleChange('amount')}
              fullWidth
              margin="normal"
              inputProps={{ step: '0.01' }}
              disabled={isReadOnly || saving || deleting}
            />
            <TextField
              label="Notas"
              multiline
              rows={3}
              value={form.notes}
              onChange={handleChange('notes')}
              fullWidth
              margin="normal"
              disabled={isReadOnly || saving || deleting}
            />
            {isRejectedViewOnly && (
              <TextField
                label="Comentario"
                multiline
                rows={2}
                value={form.adminComment || ''}
                fullWidth
                margin="normal"
                disabled
              />
            )}
            {entry && (
              <Box sx={{ mt: 1 }}>
                {Array.isArray(entry.attachments) && entry.attachments.length > 0 && (
                  <>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                    >
                      Fotos
                    </Typography>
                    {entry.attachments.map((att) => {
                      if (!att || !att.url) return null;
                      const isMarkedForRemoval =
                        att.id && attachmentsToRemove.includes(att.id);

                      return (
                        <Box
                          key={att.id || att.url}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            mb: 0.5,
                          }}
                        >
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl(`${att.url}?v=${Date.now()}`);
                            }}
                            sx={{ padding: 0, color: isMarkedForRemoval ? '#9e9e9e' : '#1E6F68' }}
                          >
                            <AttachFileIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: 12,
                              color: isMarkedForRemoval ? '#c62828' : '#1E6F68',
                              textDecoration: isMarkedForRemoval ? 'line-through' : 'underline',
                              flexGrow: 1,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl(`${att.url}?v=${Date.now()}`);
                            }}
                          >
                            {att.fileName || 'Ver foto'}
                            {isMarkedForRemoval ? ' (will be removed)' : ''}
                          </Typography>
                          {att.id && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAttachmentsToRemove((prev) =>
                                  prev.includes(att.id)
                                    ? prev.filter((id) => id !== att.id)
                                    : [...prev, att.id]
                                );
                              }}
                              sx={{
                                padding: 0.25,
                                color: isMarkedForRemoval ? '#c62828' : '#9e9e9e',
                              }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          )}
                        </Box>
                      );
                    })}
                  </>
                )}
                {(() => {
                  const existingCount =
                    entry && Array.isArray(entry.attachments)
                      ? entry.attachments.filter(
                          (att) =>
                            att &&
                            att.id &&
                            !attachmentsToRemove.includes(att.id)
                        ).length
                      : 0;
                  const remainingSlots = Math.max(0, 2 - existingCount);

                  if (remainingSlots <= 0) return null;

                  return (
                    <Box sx={{ mt: Array.isArray(entry.attachments) && entry.attachments.length > 0 ? 1 : 0 }}>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                      >
                        {existingCount === 0 ? 'Upload image attachments (max 2)' : 'Subir otra foto'}
                      </Typography>
                      {remainingSlots >= 1 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <IconButton
                            component="label"
                            size="small"
                            sx={{ padding: 0, color: '#1E6F68' }}
                          >
                            <AttachFileIcon sx={{ fontSize: 18 }} />
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={(e) => {
                                const file = e.target.files && e.target.files[0];
                                setFile1(file || null);
                              }}
                            />
                          </IconButton>
                          <Typography variant="body2" sx={{ fontSize: 12 }}>
                            {file1 ? file1.name : 'Sin fotos'}
                          </Typography>
                        </Box>
                      )}
                      {remainingSlots >= 2 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <IconButton
                            component="label"
                            size="small"
                            sx={{ padding: 0, color: '#1E6F68' }}
                          >
                            <AttachFileIcon sx={{ fontSize: 18 }} />
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={(e) => {
                                const file = e.target.files && e.target.files[0];
                                setFile2(file || null);
                              }}
                            />
                          </IconButton>
                          <Typography variant="body2" sx={{ fontSize: 12 }}>
                            {file2 ? file2.name : 'Sin fotos'}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  );
                })()}
              </Box>
            )}
            {isAdminManager && (
              <TextField
                select
                label="Status"
                value={form.status}
                onChange={handleChange('status')}
                fullWidth
                margin="normal"
                disabled={saving || deleting}
              >
                <MenuItem value="Pending">Pending</MenuItem>
                <MenuItem value="Approved">Approved</MenuItem>
                <MenuItem value="Rejected">Rejected</MenuItem>
              </TextField>
            )}
          </Box>
        )}
      </MobileFormScaffold>
      {previewUrl && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
          }}
          onClick={() => setPreviewUrl(null)}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 1400,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setPreviewUrl(null);
            }}
          >
            <IconButton
              size="small"
              sx={{
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                '&:hover': {
                  backgroundColor: 'rgba(0,0,0,0.8)',
                },
              }}
            >
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              p: 0,
              width: '100vw',
              height: '100%',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Box
              component="img"
              src={previewUrl}
              alt="Attachment preview"
              sx={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                borderRadius: 0,
              }}
            />
          </Box>
          <Box
            sx={{
              p: 1.5,
              textAlign: 'center',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
            }}
            onClick={() => setPreviewUrl(null)}
          >
            <Typography
              variant="button"
              sx={{ fontWeight: 600, color: '#1E6F68' }}
            >
              Cerrar
            </Typography>
          </Box>
        </Box>
      )}

      <O2ConfirmDialogMobile
        open={confirmDeleteOpen}
        title="Eliminar registro?"
        message="¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        loading={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          handleDeleteConfirmed();
        }}
      />
    </>
  );
}
