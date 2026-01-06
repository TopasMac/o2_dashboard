import React, { useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Box, Grid, Autocomplete, TextField } from '@mui/material';
import RHFForm from './rhf/RHFForm';
import RHFDatePicker from './rhf/RHFDatePicker';
import RHFTextField from './rhf/RHFTextField';
import RHFSelect from './rhf/RHFSelect';
import { widthMap } from './rhf/widthMap';
import { CANCUN_TZ } from '../../utils/dateTimeCancun';

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

/**
 * EmployeeTasksRHF
 *
 * Props:
 *  - initialValues?: partial task object for edit mode
 *  - onSubmit: (payload) => void
 *  - loading?: boolean (submit button / parent can use it)
 *  - employees: array of { id, shortName, division, city }
 *  - units: array of { id, unitName, city }
 *  - currentUser: optional logged-in user/employee info
 *      { id?, employeeId?, shortName?, division?, city? }
 *  - formId?: string (for AppDrawer-controlled action row)
 *  - hideActions?: boolean (hide internal buttons; let AppDrawer handle them)
 */
const EmployeeTasksRHF = ({
  initialValues = {},
  onSubmit,
  loading = false,
  employees = [],
  units = [],
  currentUser,
  formId,
  hideActions = false,
}) => {
  const today = useMemo(() => {
    const now = new Date();
    // Use sv-SE locale to get a stable 'YYYY-MM-DD HH:mm:ss' format, then slice the date part.
    const cancunStamp = now.toLocaleString('sv-SE', { timeZone: CANCUN_TZ });
    return cancunStamp.slice(0, 10); // 'YYYY-MM-DD'
  }, []);

  const defaultValues = useMemo(
    () => ({
      date: initialValues.date || today,
      dueDate: initialValues.dueDate || '',
      employeeId: initialValues.employeeId || '',
      unitId: initialValues.unitId || '',
      title: initialValues.title || '',
      description: initialValues.description || '',
      notes: initialValues.notes || '',
      priority: initialValues.priority || 'normal',
    }),
    [initialValues, today]
  );

  const methods = useForm({
    defaultValues,
  });

  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: e.shortName || e.name || `#${e.id}`,
      })),
    [employees]
  );

  const unitOptions = useMemo(
    () =>
      units.map((u) => ({
        value: u.id,
        label: u.unitName || u.name || `#${u.id}`,
      })),
    [units]
  );

  const handleSubmit = (values) => {
    const nowIso = new Date().toISOString();

    const creatorId =
      currentUser?.employeeId ?? currentUser?.id ?? null;
    const creatorShortName =
      currentUser?.shortName ?? currentUser?.name ?? null;

    const payload = {
      // Backend-required fields
      employeeId: values.employeeId,
      unitId: values.unitId || null,
      title: values.title,
      description: values.description || null,
      notes: values.notes || null,
      priority: values.priority,
      dueDate: values.dueDate || null,

      // Extra metadata for payload as requested
      status: 'open',
      division: currentUser?.division ?? null,
      city: currentUser?.city ?? null,
      createdById: creatorId,
      createdBy: creatorId
        ? {
            id: creatorId,
            shortName: creatorShortName,
          }
        : null,
      createdAt: nowIso,
      date: values.date || today,
    };

    if (onSubmit) {
      onSubmit(payload);
    }
  };

  return (
    <RHFForm
      methods={methods}
      onSubmit={handleSubmit}
      formId={formId}
      hideActions={hideActions}
      loading={loading}
    >
      <Grid container spacing={2}>
        <Grid item xs={6}>
          <Box sx={widthMap.half}>
            <RHFTextField
              name="date"
              label="Date"
              type="date"
              required
            />
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box sx={widthMap.half}>
            <RHFDatePicker
              name="dueDate"
              label="Due date"
            />
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box sx={widthMap.half}>
            <RHFSelect
              name="priority"
              label="Priority"
              options={priorityOptions}
            />
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={widthMap.half}>
              <Controller
                name="employeeId"
                control={methods.control}
                rules={{ required: true }}
                render={({ field }) => (
                  <Autocomplete
                    options={employeeOptions}
                    getOptionLabel={(option) => option?.label ?? ''}
                    value={
                      employeeOptions.find((opt) => opt.value === field.value) || null
                    }
                    onChange={(_, newValue) =>
                      field.onChange(newValue ? newValue.value : '')
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Employee"
                        variant="outlined"
                        margin="dense"
                        required
                      />
                    )}
                  />
                )}
              />
            </Box>
            <Box sx={widthMap.half}>
              <Controller
                name="unitId"
                control={methods.control}
                render={({ field }) => (
                  <Autocomplete
                    options={unitOptions}
                    getOptionLabel={(option) => option?.label ?? ''}
                    value={
                      unitOptions.find((opt) => opt.value === field.value) || null
                    }
                    onChange={(_, newValue) =>
                      field.onChange(newValue ? newValue.value : '')
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Unit"
                        variant="outlined"
                        margin="dense"
                      />
                    )}
                  />
                )}
              />
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Box sx={widthMap.full}>
            <RHFTextField
              name="title"
              label="Title"
              required
            />
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Box sx={widthMap.full}>
            <RHFTextField
              name="description"
              label="Description"
              multiline
              minRows={3}
            />
          </Box>
        </Grid>
        <Grid item xs={12}>
          <Box sx={widthMap.full}>
            <RHFTextField
              name="notes"
              label="Notes"
              multiline
              minRows={2}
            />
          </Box>
        </Grid>

      </Grid>
    </RHFForm>
  );
};

export default EmployeeTasksRHF;