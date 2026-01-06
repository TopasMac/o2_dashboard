import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import api from '../../api';
import DrawerFormScaffold from '../common/DrawerFormScaffold';
import RHFForm, { RHFTextField, RHFSelect } from './rhf/RHFForm';
import { BANKS as banks } from '../../constants/banks';

/**
 * CondoEdit_DrawerForm
 * Edit an existing condo.
 *
 * Uses the same field set as CondoNewDrawerForm, but:
 * - condoName is shown (read-only) by default (unique identifier users expect).
 * - submits via PATCH (preferred). If backend rejects PATCH (405), falls back to PUT.
 *
 * Props:
 *  - open: boolean
 *  - onClose: function
 *  - condo: object (must include at least id and condoName)
 *  - onUpdated?: function(updatedCondoOrNull)
 */
export default function CondoEdit_DrawerForm({ open, onClose, condo, onUpdated }) {
  const formId = 'condo-edit-form';

  const bankOptions = useMemo(() => {
    const arr = Array.isArray(banks) ? banks : [];
    return arr
      .filter((b) => typeof b === 'string' && b.trim() !== '')
      .map((b) => ({ value: b, label: b }));
  }, []);

  const cityOptions = useMemo(
    () => [
      { value: 'Playa del Carmen', label: 'Playa del Carmen' },
      { value: 'Tulum', label: 'Tulum' },
    ],
    []
  );

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

  useEffect(() => {
    if (!open) return;

    const c = condo || {};
    reset({
      condo_name: c.condoName || c.condo_name || '',
      city: c.city || '',
      door_code: c.doorCode || c.door_code || '',
      notes: c.notes || '',
      google_maps: c.googleMaps || c.google_maps || '',
      hoa_bank: c.hoaBank || c.hoa_bank || '',
      hoa_account_name: c.hoaAccountName || c.hoa_account_name || '',
      hoa_account_nr: c.hoaAccountNr || c.hoa_account_nr || '',
      hoa_email: c.hoaEmail || c.hoa_email || '',
      hoa_due_day:
        c.hoaDueDay != null
          ? String(c.hoaDueDay)
          : c.hoa_due_day != null
          ? String(c.hoa_due_day)
          : c.hoa_due_date != null
          ? String(c.hoa_due_date)
          : '',
    });
  }, [open, condo, reset]);

  const [saving, setSaving] = useState(false);

  const onSubmit = async (values) => {
    if (saving) return;
    if (!condo || !condo.id) {
      alert('Missing condo id.');
      return;
    }

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

      // Basic validation
      if (!payload.condoName) throw new Error('Condo name is required.');
      if (!payload.city) throw new Error('City is required.');

      const url = `/api/condos/${condo.id}`;

      // Prefer PATCH (API Platform often supports). If 405, fallback to PUT (custom controller supports).
      let res = null;
      try {
        res = await api.patch(url, payload);
      } catch (e) {
        const allow = e?.response?.headers?.allow || e?.response?.headers?.Allow;
        const status = e?.response?.status;
        const is405 = status === 405;
        const allowStr = typeof allow === 'string' ? allow : '';
        if (is405 || allowStr.toUpperCase().includes('PUT')) {
          res = await api.put(url, payload);
        } else {
          throw e;
        }
      }

      if (typeof onUpdated === 'function') {
        onUpdated(res?.data || null);
      }

      if (typeof onClose === 'function') onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[CondoEdit_DrawerForm] update failed', e);
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to update condo.';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const title = condo?.condoName ? `${condo.condoName} · Edit` : 'Edit Condo';

  return (
    <DrawerFormScaffold
      open={open}
      onClose={onClose}
      size="default"
      title={title}
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

        <RHFTextField name="door_code" label="Door code" placeholder="Optional" />

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

        <RHFTextField name="hoa_account_name" label="HOA account name" placeholder="Optional" />
        <RHFTextField name="hoa_account_nr" label="HOA account number" placeholder="Optional" />
        <RHFTextField name="hoa_email" label="HOA email" placeholder="Optional" />

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

CondoEdit_DrawerForm.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func,
  condo: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    condoName: PropTypes.string,
    city: PropTypes.string,
    doorCode: PropTypes.string,
    googleMaps: PropTypes.string,
    notes: PropTypes.string,
    hoaBank: PropTypes.string,
    hoaAccountName: PropTypes.string,
    hoaAccountNr: PropTypes.string,
    hoaEmail: PropTypes.string,
    hoaDueDay: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
  onUpdated: PropTypes.func,
};
