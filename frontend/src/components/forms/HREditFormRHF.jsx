import React, { useMemo, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import PropTypes from 'prop-types';
import { Typography, Divider, Box } from '@mui/material';
import RHFForm, {
  RHFTextField,
  RHFSelect,
  RHFDatePicker,
} from './rhf/RHFForm';
import { BANKS as banks } from '../../constants/banks';

/**
 * HREditFormRHF
 * - Mirrors HRNewForm styling/inputs, but binds to existing employee data for editing.
 * - No Save/Cancel buttons here; parent AppDrawer controls actions.
 */
const HREditFormRHF = ({ employee, onSubmit, onChange, disabled }) => {
  const roles = useMemo(() => {
    try {
      const raw = localStorage.getItem('roles');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);
  const isManagerOnly = roles.includes('ROLE_MANAGER') && !roles.includes('ROLE_ADMIN');
  // Normalize initial values from employee entity (show current data if any)
  const initialValues = useMemo(() => {
    if (!employee) {
      return {
        name: '',
        shortName: '',
        phone: '',
        email: '',
        division: '',
        area: '',
        city: '',
        dateStarted: '',
        initialSalary: '',
        currentSalary: '',
        status: 'Active',
        platformEnabled: false,
        accessPassword: '',
        accessPasswordConfirm: '',
        bankHolder: '',
        bank: '',
        accountNumber: '',
        notes: '',
      };
    }

    const fmtDate = (d) => {
      if (!d) return '';
      if (typeof d === 'string') {
        // If it's already YYYY-MM-DD, return as-is
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        // If ISO string with time, extract the date portion
        if (d.includes('T')) return d.split('T')[0];
      }
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
      return '';
    };

    return {
      id: employee.id ?? undefined,
      name: employee.name ?? '',
      shortName: employee.shortName ?? '',
      phone: employee.phone ?? '',
      email: employee.email ?? '',
      division: employee.division ?? '',
      area: employee.area ?? '',
      city: employee.city ?? '',
      dateStarted: fmtDate(employee.dateStarted),
      initialSalary: employee.initialSalary ?? '',
      currentSalary: employee.currentSalary ?? '',
      status: employee.status ?? 'Active',
      platformEnabled: employee.platformEnabled ?? false,
      accessPassword: '',
      accessPasswordConfirm: '',
      bankHolder: employee.bankHolder ?? employee.bank_holder ?? '',
      // Bank section (controller accepts 'bank' and alias 'bank_name')
      bank: employee.bank ?? employee.bankName ?? '',
      // Account number (controller accepts 'accountNumber' and alias 'bank_account')
      accountNumber: employee.accountNumber ?? employee.bankAccount ?? '',
      notes: employee.notes ?? '',
    };
  }, [employee]);

  const methods = useForm({
    defaultValues: initialValues,
  });
  
  const platformEnabledValue = useWatch({
    control: methods.control,
    name: 'platformEnabled',
  });
  
  // keep form in sync when the selected employee changes
  useEffect(() => {
    // Only reset when switching to a different employee record.
    // Avoids overwriting user edits on rerenders while editing the same employee.
    methods.reset(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id]);

  return (
    <RHFForm
      methods={methods}
      formId="hr-edit-employee-form"
      initialValues={initialValues}
      onSubmit={onSubmit}
      onChange={onChange}
      disabled={disabled}
    >
      {/* Basic Info */}
      <RHFTextField name="name" label="Full Name" width="full" required />
      <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
        <RHFTextField name="shortName" label="Short Name" width="half" />
        <RHFTextField name="phone" label="Phone" width="half" />
      </Box>
      <RHFTextField name="email" label="Email" type="email" width="full" />
      <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
        <RHFTextField name="division" label="Division" width="half" />
        <RHFTextField name="area" label="Area" width="half" />
      </Box>
      <RHFTextField name="city" label="City" width="full" />

      <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
        <RHFDatePicker name="dateStarted" label="Started" width="half" />
        {!isManagerOnly && <RHFTextField name="initialSalary" label="Initial Salary" width="half" />}
      </Box>
      <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
        {!isManagerOnly && <RHFTextField name="currentSalary" label="Current Salary" width="half" />}
        <RHFSelect
          name="status"
          label="Status"
          width={isManagerOnly ? 'full' : 'half'}
          options={[
            { label: 'Active', value: 'Active' },
            { label: 'Inactive', value: 'Inactive' },
            { label: 'Suspended', value: 'Suspended' },
          ]}
        />
      </Box>

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ opacity: 0.7, mb: 1 }}>
        Platform Access
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
        <RHFSelect
          name="platformEnabled"
          label="Platform Access"
          width="half"
          options={[
            { label: 'Disabled', value: false },
            { label: 'Enabled', value: true },
          ]}
        />
      </Box>
      <Typography variant="caption" sx={{ opacity: 0.7, mb: 2, display: 'block' }}>
        Login uses the Email field above. Changing the email here will also update the login email.
      </Typography>

      {platformEnabledValue && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            Access settings
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
            <RHFTextField
              name="accessPassword"
              label="Access Password (optional)"
              type="password"
              width="half"
            />
            <RHFTextField
              name="accessPasswordConfirm"
              label="Confirm Password"
              type="password"
              width="half"
            />
          </Box>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            If you leave the password empty, the system can generate one automatically when you create access.
          </Typography>
        </Box>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ opacity: 0.7, mb: 1 }}>
        Bank Details
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
        <RHFTextField name="bankHolder" label="Bank Holder" width="half" />
        <RHFSelect
          name="bank"
          label="Bank"
          width="half"
          options={(banks || [])
            .filter((b) => typeof b === 'string' || (b && typeof b.label === 'string'))
            .map((b) => (typeof b === 'string' ? { label: b, value: b } : { label: b.label, value: b.value ?? b.label }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))}
          placeholder="Select..."
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 2, width: '100%', mt: 1 }}>
        <RHFTextField name="accountNumber" label="Account Number" width="half" />
      </Box>

      <RHFTextField
        name="notes"
        label="Notes"
        width="full"
        multiline
        minRows={3}
      />
    </RHFForm>
  );
};

HREditFormRHF.propTypes = {
  employee: PropTypes.object,
  onSubmit: PropTypes.func,
  onChange: PropTypes.func,
  disabled: PropTypes.bool,
};

export default HREditFormRHF;
