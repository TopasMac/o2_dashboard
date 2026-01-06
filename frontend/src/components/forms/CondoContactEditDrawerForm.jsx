import React from 'react';
import { useForm } from 'react-hook-form';
import api from '../../api';
import DrawerFormScaffold from '../common/DrawerFormScaffold';
import RHFForm, { RHFTextField, RHFSelect } from './rhf/RHFForm';

/**
 * CondoContactEditDrawerForm
 * - Edit + Delete for an existing condo contact
 *
 * Props:
 *  - open: boolean
 *  - onClose: function
 *  - contact: object (must include at least id, condo, department, name, phone, email, notes)
 *  - onUpdated: function(updatedContact) optional
 *  - onDeleted: function(deletedId) optional
 */
export default function CondoContactEditDrawerForm({
  open,
  onClose,
  contact,
  onUpdated,
  onDeleted,
}) {
  const contactId = contact?.id;
  const formId = React.useMemo(
    () => `condo-contact-edit-form-${contactId || 'x'}`,
    [contactId]
  );

  const [saving, setSaving] = React.useState(false);
  const [submitError, setSubmitError] = React.useState(null);

  const defaultValues = React.useMemo(
    () => ({
      condo: contact?.condo || '',
      department: contact?.department || 'Admin',
      name: contact?.name || '',
      phone: contact?.phone || '',
      email: contact?.email || '',
      notes: contact?.notes || '',
    }),
    [contact]
  );

  const methods = useForm({
    defaultValues,
  });

  // Keep form in sync when switching contacts
  React.useEffect(() => {
    try {
      methods.reset(defaultValues);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues, open]);

  const handleSubmit = async (values) => {
    if (!contactId) {
      setSubmitError('Missing contact id.');
      return;
    }

    setSubmitError(null);
    setSaving(true);

    const payload = {
      condo: values.condo,
      department: values.department || null,
      name: values.name || null,
      phone: values.phone || null,
      email: values.email || null,
      notes: values.notes || null,
    };

    try {
      const resp = await api.patch(
        `/api/condo_contacts/${contactId}`,
        payload,
        { headers: { 'Content-Type': 'application/merge-patch+json' } }
      );
      const updated = resp?.data || { ...payload, id: contactId };

      if (typeof onUpdated === 'function') {
        onUpdated(updated);
      }

      if (typeof onClose === 'function') {
        onClose();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[CondoContactEditDrawerForm] submit failed', e);
      const msg = e?.response?.data?.detail || e?.message || 'Failed to update contact.';
      setSubmitError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contactId) return;

    const ok = window.confirm('Delete this contact?');
    if (!ok) return;

    setSubmitError(null);
    setSaving(true);

    try {
      await api.delete(`/api/condo_contacts/${contactId}`);

      if (typeof onDeleted === 'function') {
        onDeleted(contactId);
      }

      if (typeof onClose === 'function') {
        onClose();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[CondoContactEditDrawerForm] delete failed', e);
      const msg = e?.response?.data?.detail || e?.message || 'Failed to delete contact.';
      setSubmitError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerFormScaffold
      open={open}
      onClose={onClose}
      size="compact"
      title="Edit Contact"
      formId={formId}
      showActions={true}
      actions={{
        saveLabel: saving ? 'Saving…' : 'Save',
        cancelLabel: 'Cancel',
        deleteLabel: 'Delete',
        showDelete: true,
      }}
      onDelete={handleDelete}
      bodyPadding={16}
      maxContentWidth="100%"
      contentSx={saving ? { pointerEvents: 'none', opacity: 0.85 } : undefined}
    >
      <RHFForm formId={formId} methods={methods} onSubmit={handleSubmit}>
        {submitError ? (
          <div
            style={{
              padding: '10px 12px',
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.06)',
              color: '#b91c1c',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {submitError}
          </div>
        ) : null}

        <RHFSelect
          name="department"
          label="Department"
          options={[
            { value: 'Admin', label: 'Admin' },
            { value: 'Front Desk', label: 'Front Desk' },
            { value: 'Security', label: 'Security' },
            { value: 'Maintenance', label: 'Maintenance' },
            { value: 'Other', label: 'Other' },
          ]}
        />

        <RHFTextField name="name" label="Name" placeholder="Full name" />
        <RHFTextField name="phone" label="Phone" placeholder="+52 ..." />
        <RHFTextField name="email" label="Email" placeholder="name@example.com" />
        <RHFTextField name="notes" label="Notes" placeholder="Optional" multiline minRows={3} />
      </RHFForm>
    </DrawerFormScaffold>
  );
}
