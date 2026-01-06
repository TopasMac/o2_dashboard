import React, { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import RHFTextField from './rhf/RHFTextField';
import RHFSelect from './rhf/RHFSelect';
import RHFDatePicker from './rhf/RHFDatePicker';
import { widthMap } from './rhf/widthMap';
import {
  Box,
  Button,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

const STATUS_OPTIONS = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Allocated', label: 'Allocated' },
  { value: 'Rejected', label: 'Rejected' },
];

const TYPE_OPTIONS = [
  { value: 'CashAdvance', label: 'Cash Advance' },
  { value: 'GuestPayment', label: 'Guest Payment' },
  { value: 'CashReturn', label: 'Cash Return' },
  { value: 'Expense', label: 'Expense' },
  { value: 'Other', label: 'Other' },
];

/**
 * EmployeeCashLedgerEditFormRHF
 *
 * Admin / manager-only edit form for EmployeeCashLedger rows.
 *
 * Props:
 *  - row: the existing ledger row to edit (API shape)
 *  - onSubmit(formPayload): called when the user submits the form
 *  - onDelete(row): called when the user clicks "Delete"
 *  - onCancel(): called when the user cancels/closes
 *
 * This component does NOT call the API directly. The parent is responsible
 * for wiring the payload to /api/employee-cash-ledger/{id} and for handling
 * attachment upload/removal endpoints.
 */
export default function EmployeeCashLedgerEditFormRHF({
  row,
  onSubmit,
  onDelete,
  onCancel,
  formId,
}) {
  const initialAttachments = useMemo(
    () => (row?.attachments && Array.isArray(row.attachments) ? row.attachments : []),
    [row]
  );

  const [existingAttachments, setExistingAttachments] = useState(initialAttachments);
  const [attachmentsToRemove, setAttachmentsToRemove] = useState([]);
  const [filesToUpload, setFilesToUpload] = useState([]);

  const defaultValues = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return {
      date: row?.date || todayIso,
      employeeShortName: row?.employeeShortName || row?.employee?.shortName || '',
      type: row?.type || '',
      notes: row?.notes || '',
      amount: row?.amount || '',
      status: row?.status || 'Pending',
      adminComment: row?.adminComment || '',
    };
  }, [row]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm({
    defaultValues,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  // Client-side validation: adminComment required when status is Rejected
  const watchedStatus = watch('status');
  const watchedAdminComment = watch('adminComment');

  useEffect(() => {
    if (watchedStatus === 'Rejected') {
      const val = typeof watchedAdminComment === 'string' ? watchedAdminComment.trim() : '';
      if (!val) {
        setError('adminComment', { type: 'required', message: 'Please add a comment' });
        return;
      }
    }

    // If status is not Rejected or comment is present, clear any prior error
    if (errors?.adminComment) {
      clearErrors('adminComment');
    }
  }, [watchedStatus, watchedAdminComment, setError, clearErrors, errors]);

  const handleRemoveExistingAttachment = (attachment) => {
    setExistingAttachments((prev) => prev.filter((att) => att.id !== attachment.id));
    setAttachmentsToRemove((prev) =>
      prev.includes(attachment) ? prev : [...prev, attachment]
    );
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setFilesToUpload((prev) => [...prev, ...files]);

    // Reset input so selecting the same file again triggers onChange
    event.target.value = '';
  };

  const onSubmitInternal = (values) => {
    if (!onSubmit) return;

    let normalizedDate = values.date;

    // If the RHFDatePicker provided a Date object, normalize to YYYY-MM-DD for the API
    if (normalizedDate instanceof Date && !Number.isNaN(normalizedDate.getTime())) {
      const year = normalizedDate.getFullYear();
      const month = String(normalizedDate.getMonth() + 1).padStart(2, '0');
      const day = String(normalizedDate.getDate()).padStart(2, '0');
      normalizedDate = `${year}-${month}-${day}`;
    }

    const payload = {
      ...values,
      date: normalizedDate,
      id: row?.id,
      existingAttachments,
      attachmentsToRemove,
      filesToUpload,
    };

    onSubmit(payload);
  };

  const handleDeleteClick = () => {
    if (!onDelete) return;
    onDelete(row);
  };

  return (
    <Box
      component="form"
      id={formId}
      onSubmit={handleSubmit(onSubmitInternal)}
      noValidate
      sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}
    >
      <RHFDatePicker
        name="date"
        label="Date"
        control={control}
        width="full"
      />

      <RHFSelect
        name="type"
        label="Type"
        options={TYPE_OPTIONS}
        width="full"
        control={control}
      />

      <RHFTextField
        name="notes"
        label="Notes"
        multiline
        minRows={2}
        width="full"
        control={control}
      />

      <RHFTextField
        name="amount"
        label="Amount"
        type="number"
        width="full"
        control={control}
      />

      <RHFSelect
        name="status"
        label="Status"
        options={STATUS_OPTIONS}
        width="full"
        control={control}
      />

      <RHFTextField
        name="adminComment"
        label="Admin comment"
        multiline
        minRows={2}
        width="full"
        control={control}
      />
      {errors?.adminComment?.message && (
        <Typography variant="body2" color="error" sx={{ mt: -1.5 }}>
          {errors.adminComment.message}
        </Typography>
      )}

      <Box sx={{ mt: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
          Attachments
        </Typography>

        {existingAttachments.length === 0 && filesToUpload.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No attachments yet.
          </Typography>
        )}

        {existingAttachments.length > 0 && (
          <List dense>
            {existingAttachments.map((att) => (
              <ListItem key={att.id}>
                <ListItemText
                  primary={att.fileName || att.url || `Attachment #${att.id}`}
                  secondary={att.category || null}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    aria-label="remove"
                    onClick={() => handleRemoveExistingAttachment(att)}
                    size="small"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        {filesToUpload.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              New files to upload:
            </Typography>
            <List dense>
              {filesToUpload.map((file, idx) => (
                <ListItem key={idx}>
                  <ListItemText primary={file.name} />
                </ListItem>
              ))}
            </List>
          </>
        )}

        <Box sx={{ mt: 1 }}>
          <Button variant="outlined" component="label" size="small">
            Add attachment
            <input
              type="file"
              hidden
              onChange={handleFileChange}
              multiple
              accept="application/pdf,image/*"
            />
          </Button>
        </Box>
      </Box>
    </Box>
  );
}