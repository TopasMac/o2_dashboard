import React from 'react';
import DrawerFormScaffold from '../common/DrawerFormScaffold';
import { useForm } from 'react-hook-form';
import RHFForm, { RHFTextField, RHFSelect } from './rhf/RHFForm';
import api from '../../api';

/**
 * CondoContactNewDrawerForm
 * - Small form to create a new condo contact
 * - Uses standardized drawer header + actions (Save/Cancel) via DrawerFormScaffold
 *
 * Expected props:
 *  - open: boolean
 *  - onClose: function
 *  - condoId: number | string (API id)
 *  - condoIri: string (optional, e.g. "/api/condos/3")
 *  - onCreated: function(newContact) optional
 */
export default function CondoContactNewDrawerForm({
  open,
  onClose,
  condoId,
  condoIri,
  onCreated,
}) {
  const formId = 'condo-contact-new-form';

  const [saving, setSaving] = React.useState(false);
  const [submitError, setSubmitError] = React.useState(null);

  const defaultValues = React.useMemo(() => ({
    condo: condoIri || (condoId ? `/api/condos/${condoId}` : ''),
    department: 'Admin',
    name: '',
    phone: '',
    email: '',
    notes: '',
  }), [condoId, condoIri]);

  const methods = useForm({
    defaultValues,
  });

  const handleSubmit = async (values) => {
    setSubmitError(null);
    setSaving(true);

    // Payload must match API Platform fields
    const payload = {
      condo: values.condo,
      department: values.department || null,
      name: values.name || null,
      phone: values.phone || null,
      email: values.email || null,
      notes: values.notes || null,
    };

    try {
      const resp = await api.post('/api/condo_contacts', payload);
      const created = resp?.data || payload;

      if (typeof onCreated === 'function') {
        onCreated(created);
      }

      // Reset for next open
      try {
        methods.reset({
          ...defaultValues,
          // keep condo prefilled
          condo: payload.condo,
        });
      } catch {}

      if (typeof onClose === 'function') {
        onClose();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[CondoContactNewDrawerForm] submit failed', e);
      const msg = e?.response?.data?.detail || e?.message || 'Failed to create contact.';
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
      title="New Contact"
      formId={formId}
      showActions={true}
      actions={{ saveLabel: saving ? 'Saving…' : 'Save', cancelLabel: 'Cancel', showDelete: false, showSave: true }}
      bodyPadding={16}
      maxContentWidth="100%"
      contentSx={saving ? { pointerEvents: 'none', opacity: 0.85 } : undefined}
    >
      <RHFForm
        formId={formId}
        methods={methods}
        onSubmit={handleSubmit}
      >
        {submitError ? (
          <div style={{
            padding: '10px 12px',
            border: '1px solid rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.06)',
            color: '#b91c1c',
            borderRadius: 8,
            fontSize: 13,
          }}>
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
