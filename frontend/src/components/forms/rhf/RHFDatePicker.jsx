import dayjs from 'dayjs';
import { Controller } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers';
import { widthMap } from './widthMap';

export default function RHFDatePicker({ name, control, label, widthVariant = 'full', sx, ...rest }) {
  const widthSx = widthMap[widthVariant] || widthMap.full;

  // Build a consistent text field style that matches MUI TextField (outlined/medium)
  const baseInputHeight = (rest.size === 'small' || rest?.slotProps?.textField?.size === 'small') ? 40 : 56;
  const paddingY = (rest.size === 'small' || rest?.slotProps?.textField?.size === 'small') ? '8px' : '14px';

  const mergedTextFieldSx = {
    ...(widthSx || {}),
    height: baseInputHeight,
    display: 'flex',
    alignItems: 'center',
    mb: 2,
    paddingBottom: 0,
    '& .MuiInputBase-root': { height: baseInputHeight, alignItems: 'center' },
    '& .MuiInputBase-input': { padding: `${paddingY} 14px` },
    '& .MuiFormHelperText-root': { display: 'none', height: 0, minHeight: 0, margin: 0, padding: 0 },
    '&.MuiFormControl-root': { margin: 0 },
    // remove default bottom padding that MUI X adds on picker text fields
    '&.MuiPickersTextField-root': { paddingBottom: 0 },
    '& .MuiPickersTextField-root': { paddingBottom: 0 },
    ...(sx || {}),
    ...(rest.sx || {}) // keep backward-compat: allow passing sx at component level
  };

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <DatePicker
          label={label}
          format="DD/MM/YYYY"
          value={(() => {
            const v = field.value;
            if (!v) return null;
            if (dayjs.isDayjs(v)) return v;
            return dayjs(v);
          })()}
          onChange={(v) => field.onChange(v ? dayjs(v).format('YYYY-MM-DD') : '')}
          slotProps={{
            // allow consumer overrides but enforce sensible defaults for alignment
            ...(rest.slotProps || {}),
            openPickerButton: {
              sx: { mr: 0, p: 0 }
            },
            textField: {
              ...(rest.slotProps?.textField || {}),
              error: !!fieldState.error,
              helperText: fieldState.error ? fieldState.error.message : undefined,
              fullWidth: widthVariant !== 'auto' ? true : rest.fullWidth,
              variant: rest.variant ?? rest.slotProps?.textField?.variant ?? 'outlined',
              size: rest.size ?? rest.slotProps?.textField?.size ?? 'medium',
              margin: rest.margin ?? rest.slotProps?.textField?.margin ?? 'none',
              InputLabelProps: {
                shrink: true,
                ...(rest.slotProps?.textField?.InputLabelProps || {}),
                ...(rest.InputLabelProps || {})
              },
              FormHelperTextProps: {
                sx: {
                  minHeight: 0,
                  m: 0,
                  ...(rest.slotProps?.textField?.FormHelperTextProps?.sx || {}),
                  ...(rest.FormHelperTextProps?.sx || {})
                },
                ...(rest.slotProps?.textField?.FormHelperTextProps || {}),
                ...(rest.FormHelperTextProps || {})
              },
              FormControlProps: {
                sx: { m: 0 }
              },
              sx: {
                ...(rest.slotProps?.textField?.sx || {}),
                ...mergedTextFieldSx
              }
            }
          }}
          {...rest}
        />
      )}
    />
  );
}
