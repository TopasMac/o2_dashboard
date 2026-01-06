import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import api from '../../api';
import DrawerFormScaffold from '../common/DrawerFormScaffold';
import RHFForm, { RHFTextField, RHFSelect } from './rhf/RHFForm';
import { BANKS as banks } from '../../constants/banks';

/**
 * CondoNewDrawerForm
 * - AppDrawer-based drawer form to create a new Condo
 *
 * Fields:
 *  - condo_name (required)
 *  - city (required): Playa del Carmen | Tulum
 *  - door_code
 *  - notes
 *  - google_maps
 *  - hoa_bank (dropdown from constants/banks.js)
 *  - hoa_account_name
 *  - hoa_account_nr
 *  - hoa_email
 *  - hoa_due_day
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - onCreated?: (createdCondo) => void  // optional callback after successful create
 */
export default function CondoNewDrawerForm({ open, onClose, onCreated }) {
  const formId = 'condo-new-form';

  const bankOptions = useMemo(() => {
    const arr = Array.isArray(banks) ? banks : [];
    return arr
      .filter((b) => typeof b === 'string' && b.trim() !== '')
      .map((b) => ({ value: b, label: b }));
  }, []);

  const cityOptions = useMemo(() => ([
    { value: 'Playa del Carmen', label: 'Playa del Carmen' },
    { value: 'Tulum', label: 'Tulum' },
  ]), []);

  const methods = useForm({
    mode: 'onSubmit',
    defaultValues: {
      condo_name: '',
      city: '',
      door_code: '',
      notes: '',
      google_maps: '',
      hoa_bank: '',
      hoa_account_name: '',
      hoa_account_nr: '',
      hoa_email: '',
      hoa_due_day: '',
    },
  });

  const { reset } = methods;

  const [saving, setSaving] = useState(false);

  const onSubmit = async (values) => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        // Primary (API Platform / entity props)
        condoName: (values.condo_name || '').trim(),
        city: values.city || null,
        doorCode: values.door_code ? String(values.door_code).trim() : null,
        notes: values.notes ? String(values.notes).trim() : null,
        googleMaps: values.google_maps ? String(values.google_maps).trim() : null,
        hoaBank: values.hoa_bank ? String(values.hoa_bank).trim() : null,
        hoaAccountName: values.hoa_account_name ? String(values.hoa_account_name).trim() : null,
        hoaAccountNr: values.hoa_account_nr ? String(values.hoa_account_nr).trim() : null,
        hoaEmail: values.hoa_email ? String(values.hoa_email).trim() : null,
        hoaDueDay: values.hoa_due_day !== '' && values.hoa_due_day != null ? Number(values.hoa_due_day) : null,

        // Also send snake_case aliases (safe if ignored)
        condo_name: (values.condo_name || '').trim(),
        door_code: values.door_code ? String(values.door_code).trim() : null,
        google_maps: values.google_maps ? String(values.google_maps).trim() : null,
        hoa_bank: values.hoa_bank ? String(values.hoa_bank).trim() : null,
        hoa_account_name: values.hoa_account_name ? String(values.hoa_account_name).trim() : null,
        hoa_account_nr: values.hoa_account_nr ? String(values.hoa_account_nr).trim() : null,
        hoa_email: values.hoa_email ? String(values.hoa_email).trim() : null,
        hoa_due_day: values.hoa_due_day !== '' && values.hoa_due_day != null ? Number(values.hoa_due_day) : null,
        hoa_due_date: values.hoa_due_day !== '' && values.hoa_due_day != null ? Number(values.hoa_due_day) : null,
      };

      // Basic client-side validation (required fields)
      if (!payload.condoName) {
        throw new Error('Condo name is required.');
      }
      if (!payload.city) {
        throw new Error('City is required.');
      }

      const res = await api.post('/api/condos', payload);

      // Notify parent (optional)
      if (typeof onCreated === 'function') {
        onCreated(res?.data || null);
      }

      // Reset and close
      reset();
      if (typeof onClose === 'function') onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[CondoNewDrawerForm] create failed', e);
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        'Failed to create condo.';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerFormScaffold
      open={open}
      onClose={onClose}
      size="default"
      title="New Condo"
      formId={formId}
      showActions
      actions={{
        saveLabel: saving ? 'Saving…' : 'Save',
        cancelLabel: 'Cancel',
        showDelete: false,
        showSave: true,
      }}
      bodyPadding={16}
      maxContentWidth="100%"
      fullBleed
    >
      <RHFForm formId={formId} methods={methods} onSubmit={onSubmit}>
        <RHFTextField
          name="condo_name"
          label="Condo name"
          required
          placeholder="e.g. 5aLia"
        />

        <RHFSelect
          name="city"
          label="City"
          required
          options={cityOptions}
          placeholder="Select city"
        />

        <RHFTextField
          name="door_code"
          label="Door code"
          placeholder="Optional"
        />

        <RHFTextField
          name="notes"
          label="Notes"
          placeholder="Optional"
          multiline
          minRows={3}
        />

        <RHFTextField
          name="google_maps"
          label="Google Maps"
          placeholder="https://maps.google.com/..."
        />

        <RHFSelect
          name="hoa_bank"
          label="HOA bank"
          options={bankOptions}
          placeholder="Select bank (optional)"
        />

        <RHFTextField
          name="hoa_account_name"
          label="HOA account name"
          placeholder="Optional"
        />

        <RHFTextField
          name="hoa_account_nr"
          label="HOA account number"
          placeholder="Optional"
        />

        <RHFTextField
          name="hoa_email"
          label="HOA email"
          placeholder="Optional"
        />

        <RHFTextField
          name="hoa_due_day"
          label="HOA due day"
          placeholder="1–31"
          type="number"
          inputProps={{ min: 1, max: 31 }}
        />
      </RHFForm>
    </DrawerFormScaffold>
  );
}

CondoNewDrawerForm.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func,
  onCreated: PropTypes.func,
};
