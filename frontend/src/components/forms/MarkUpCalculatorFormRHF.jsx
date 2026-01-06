import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { TextField, Box, Typography, Button } from '@mui/material';
import RHFForm from './rhf/RHFForm';
import api from '../../api';

/**
 * MarkUpCalculatorFormRHF
 * Form for calculating markup: input 'paid', auto-calculate 'charged'.
 */
const MarkUpCalculatorFormRHF = ({ formId = 'markup-form' }) => {
  const { control, handleSubmit, watch, setValue, reset } = useForm({
    defaultValues: {
      paid: '',
      charged: '',
    },
  });

  // Watch the 'paid' field for changes
  const paid = watch('paid');

  useEffect(() => {
    // Only fetch if paid is a valid number
    if (paid && !isNaN(Number(paid))) {
      api
        .get('/api/markup/calc', { params: { amount: Number(paid) } })
        .then((res) => {
          if (res.data && res.data.charged != null) {
            const val = typeof res.data.charged === 'number' ? res.data.charged.toFixed(2) : String(res.data.charged);
            setValue('charged', val, { shouldValidate: true });
          }
        })
        .catch(() => {
          setValue('charged', '', { shouldValidate: true });
        });
    } else {
      setValue('charged', '', { shouldValidate: true });
    }
  }, [paid, setValue]);

  const onReset = () => {
    reset({ paid: '', charged: '' });
  };

  return (
    <RHFForm formId={formId} onSubmit={handleSubmit(onReset)}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" component="div">
          Calculate Markup
        </Typography>
      </Box>
      <Controller
        name="paid"
        control={control}
        rules={{ required: 'Paid amount is required', min: { value: 0, message: 'Must be non-negative' } }}
        render={({ field, fieldState }) => (
          <TextField
            {...field}
            label="Paid"
            type="number"
            variant="outlined"
            fullWidth
            margin="normal"
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            inputProps={{ min: 0, step: 'any' }}
          />
        )}
      />
      <Controller
        name="charged"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            label="Charged"
            type="number"
            variant="outlined"
            fullWidth
            margin="normal"
            InputProps={{
              readOnly: true,
            }}
          />
        )}
      />
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="button" variant="outlined" color="warning" onClick={onReset}>
          Reset
        </Button>
      </Box>
    </RHFForm>
  );
};

export default MarkUpCalculatorFormRHF;