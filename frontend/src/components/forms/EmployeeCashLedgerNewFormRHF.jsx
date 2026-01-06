import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useForm, Controller } from 'react-hook-form';
import RHFForm, { RHFTextField, RHFSelect, RHFDatePicker } from './rhf/RHFForm';
import { Box, Stack, Autocomplete, TextField } from '@mui/material';
import { widthMap } from './rhf/widthMap';
import api from '../../api';

const EMPLOYEE_CASH_TYPES = [
  { value: 'CashAdvance', label: 'Cash Advance' },
  { value: 'GuestPayment', label: 'Guest Payment' },
  { value: 'CashReturn', label: 'Cash Return' },
  { value: 'Expense', label: 'Expense' },
  { value: 'Other', label: 'Other' },
];

export default function EmployeeCashLedgerNewFormRHF({ onSubmit, formId }) {
  const methods = useForm({
    defaultValues: {
      date: new Date(),
      employeeId: '',
      type: '',
      division: '',
      city: '',
      amount: '',
      notes: '',
    },
  });

  const { handleSubmit, control, setValue } = methods;

  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeesError, setEmployeesError] = useState(null);

  useEffect(() => {
    const loadEmployees = async () => {
      setLoadingEmployees(true);
      setEmployeesError(null);
      try {
        const data = await api.get('/api/employee-cash-ledger/form-options');
        // Support both plain JSON and wrapped responses (e.g. { data: { employees: [...] } })
        let employeesPayload = [];

        if (data && Array.isArray(data.employees)) {
          employeesPayload = data.employees;
        } else if (data && data.data && Array.isArray(data.data.employees)) {
          employeesPayload = data.data.employees;
        }

        setEmployees(employeesPayload);
      } catch (err) {
        console.error(err);
        setEmployeesError(err.message || 'Error loading employees');
      } finally {
        setLoadingEmployees(false);
      }
    };

    loadEmployees();
  }, []);

  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: e.shortName || `Employee #${e.id}`,
    division: e.division || '',
    city: e.city || '',
  }));

  return (
    <RHFForm
      methods={methods}
      onSubmit={handleSubmit(onSubmit || (() => {}))}
      id={formId}
      formId={formId}
    >
      <Stack spacing={2}>
        <Box sx={widthMap.full}>
          <RHFDatePicker
            name="date"
            label="Date"
            fullWidth
            inputFormat="dd-MM-yyyy"
          />
        </Box>

        <Box sx={widthMap.full}>
          <Controller
            name="employeeId"
            control={control}
            render={({ field }) => {
              const selectedOption =
                employeeOptions.find((opt) => opt.value === field.value) || null;

              return (
                <Autocomplete
                  options={employeeOptions}
                  loading={loadingEmployees}
                  value={selectedOption}
                  onChange={(event, newValue) => {
                    const newId = newValue ? newValue.value : '';
                    field.onChange(newId);

                    if (newValue) {
                      setValue('division', newValue.division || '');
                      setValue('city', newValue.city || '');
                    } else {
                      setValue('division', '');
                      setValue('city', '');
                    }
                  }}
                  getOptionLabel={(option) => option.label || ''}
                  isOptionEqualToValue={(option, value) =>
                    option.value === value.value
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Employee"
                      fullWidth
                      size="small"
                      error={!!employeesError}
                      helperText={employeesError || ''}
                    />
                  )}
                />
              );
            }}
          />
        </Box>

        <Box sx={widthMap.full}>
          <RHFSelect
            name="type"
            label="Type"
            fullWidth
            options={EMPLOYEE_CASH_TYPES}
          />
        </Box>

        <Stack direction="row" spacing={2}>
          <Box sx={widthMap.half}>
            <RHFTextField
              name="division"
              label="Division"
              fullWidth
            />
          </Box>
          <Box sx={widthMap.half}>
            <RHFTextField
              name="city"
              label="City"
              fullWidth
            />
          </Box>
        </Stack>

        <Box sx={widthMap.full}>
          <RHFTextField
            name="amount"
            label="Amount"
            type="number"
            fullWidth
          />
        </Box>

        <Box sx={widthMap.full}>
          <RHFTextField
            name="notes"
            label="Notes"
            multiline
            rows={3}
            fullWidth
          />
        </Box>

        {/* Attachments field will be added later */}
      </Stack>
    </RHFForm>
  );
}

EmployeeCashLedgerNewFormRHF.propTypes = {
  onSubmit: PropTypes.func,
  formId: PropTypes.string,
};