import React from 'react';
import PropTypes from 'prop-types';
import { useFormContext, Controller } from 'react-hook-form';
import { Checkbox, FormControlLabel, FormControl, FormHelperText } from '@mui/material';

/**
 * RHFCheckbox
 * -----------------------------------------------------------------------------
 * A reusable checkbox field wired to react-hook-form using MUI components.
 *
 * Props:
 *  - name (string, required): form field name
 *  - label (node|string): label rendered next to the checkbox
 *  - labelPlacement ('end'|'start'|'top'|'bottom'): MUI label placement
 *  - disabled (bool): disable the checkbox
 *  - sx (object): style overrides for the root FormControl
 *  - onChange (func): optional callback invoked after RHF updates the value
 *  - ...other: passed to MUI <Checkbox /> (e.g., size="small", color="primary")
 *
 * Behavior:
 *  - Stores boolean true/false in RHF (not "on"/"off")
 *  - Shows validation error message from RHF (if any)
 */
export default function RHFCheckbox({
  name,
  label,
  labelPlacement = 'end',
  disabled = false,
  sx,
  onChange,
  ...other
}) {
  const { control } = useFormContext();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const { value, onChange: rhfOnChange, ref } = field;
        const { error } = fieldState;

        const handleChange = (event, checked) => {
          rhfOnChange(checked);
          if (typeof onChange === 'function') onChange(checked, event);
        };

        return (
          <FormControl
            component="fieldset"
            error={!!error}
            sx={sx}
          >
            <FormControlLabel
              control={
                <Checkbox
                  inputRef={ref}
                  checked={!!value}
                  onChange={handleChange}
                  disabled={disabled}
                  {...other}
                />
              }
              label={label}
              labelPlacement={labelPlacement}
            />
            {error?.message ? (
              <FormHelperText>{error.message}</FormHelperText>
            ) : null}
          </FormControl>
        );
      }}
    />
  );
}

RHFCheckbox.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.oneOfType([PropTypes.node, PropTypes.string]),
  labelPlacement: PropTypes.oneOf(['end', 'start', 'top', 'bottom']),
  disabled: PropTypes.bool,
  sx: PropTypes.object,
  onChange: PropTypes.func,
};