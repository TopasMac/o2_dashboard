import { Controller } from 'react-hook-form';
import { TextField, MenuItem } from '@mui/material';

export default function RHFSelect({ name, control, label, options = [], getOptionLabel = o => o?.label ?? o, getOptionValue = o => o?.value ?? o, sx, ...rest }) {

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''} // prevent MUI warning: value should not be null/undefined
          select
          label={label}
          margin="dense"
          error={!!fieldState.error}
          helperText={fieldState.error?.message || rest.helperText}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true, MenuProps: { disablePortal: false, keepMounted: true }, ...(rest.SelectProps||{}) }}
          fullWidth
          sx={{ width: '100%', maxWidth: '100%', mb: 2, ...(sx || {}), ...(rest.sx || {}) }}
          {...rest}
        >
          {Array.isArray(options) && options.length > 0 ? (
            options.map((opt) => (
              <MenuItem key={getOptionValue(opt)} value={getOptionValue(opt)}>
                {getOptionLabel(opt)}
              </MenuItem>
            ))
          ) : (
            <MenuItem value="__no_options__" disabled>
              No options
            </MenuItem>
          )}
        </TextField>
      )}
    />
  );
}
