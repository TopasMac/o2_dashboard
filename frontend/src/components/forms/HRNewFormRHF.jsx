import React from 'react';
import { useForm } from 'react-hook-form';
import RHFForm, { RHFTextField, RHFSelect, RHFDatePicker } from './rhf/RHFForm';
import { widthMap } from '../forms/rhf/widthMap';
import { BANKS as banks } from '../../constants/banks';

/**
 * HRNewFormRHF
 * Simple form for creating a new employee.
 * Fields:
 *  - fullName (Full Name)
 *  - shortName (Short Name)
 *
 * Notes:
 *  - No action buttons here (Save/Cancel handled externally by AppDrawer).
 *  - Exposes a formId so external buttons can trigger submit via form attribute.
 */
const HRNewFormRHF = ({
  formId = 'hr-new-employee-form',
  defaultValues = {
    name: '',
    shortName: '',
    phone: '',
    email: '',
    division: '',
    area: '',
    city: '',
    dateStarted: null,
    initialSalary: '',
    bankHolder: '',
    bank: '',
    accountNumber: '',
  },
  onSubmit,
}) => {
  const methods = useForm({ defaultValues });
  const sortedBanks = (Array.isArray(banks) ? banks : [])
    .map((b) => (typeof b === 'string' ? { label: b, value: b } : b))
    .filter((b) => b && typeof b.label === 'string')
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  const handleSubmit = onSubmit ?? (() => {});

  return (
    <RHFForm
      formId={formId}
      methods={methods}
      onSubmit={handleSubmit}
    >
      <RHFTextField
        name="name"
        label="Full Name"
        width="full"
        required
        autoFocus
      />
      <RHFTextField
        name="shortName"
        label="Short Name"
        width="full"
        required
      />
      <RHFTextField
        name="phone"
        label="Phone"
        width="half"
      />
      <RHFTextField
        name="email"
        label="Email"
        width="half"
        type="email"
      />
      <RHFSelect
        name="division"
        label="Division"
        width="half"
        options={[
          { label: 'Owners2', value: 'Owners2' },
          { label: 'Housekeepers', value: 'Housekeepers' }
        ]}
        placeholder="Select..."
      />
      <RHFSelect
        name="area"
        label="Area"
        width="half"
        options={[
          { label: 'Admin', value: 'Admin' },
          { label: 'Manager', value: 'Manager' },
          { label: 'Supervisor', value: 'Supervisor' },
          { label: 'Cleaner', value: 'Cleaner' }
        ]}
        placeholder="Select..."
      />
      <RHFSelect
        name="city"
        label="City"
        width="half"
        options={[
          { label: 'General', value: 'General' },
          { label: 'Playa del Carmen', value: 'Playa del Carmen' },
          { label: 'Tulum', value: 'Tulum' }
        ]}
        placeholder="Select..."
      />
      <RHFDatePicker
        name="dateStarted"
        label="Date Started"
        width="half"
      />
      <RHFTextField
        name="initialSalary"
        label="Initial Salary"
        width="half"
        type="number"
        inputProps={{ inputMode: 'decimal', step: '0.01' }}
      />
      <div style={{ marginTop: 20, fontWeight: 600, fontSize: 15 }}>Bank Details</div>
      <RHFTextField
        name="bankHolder"
        label="Bank Holder"
        width="half"
      />
      <RHFSelect
        name="bank"
        label="Bank"
        width="half"
        options={sortedBanks}
        placeholder="Select..."
      />
      <RHFTextField
        name="accountNumber"
        label="Account Number"
        width="half"
      />
      {/* No action buttons here; AppDrawer controls them */}
    </RHFForm>
  );
};

export default HRNewFormRHF;