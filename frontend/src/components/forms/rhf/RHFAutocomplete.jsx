import * as React from 'react';
import PropTypes from 'prop-types';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { Controller, useFormContext } from 'react-hook-form';

/**
 * RHFAutocomplete
 * A React Hook Form wrapper around MUI Autocomplete that stores only the option's `value` in the form state.
 *
 * Expected option shape: { value: any, label: string }
 * The component finds the selected option by matching option.value === field.value.
 */
export default function RHFAutocomplete({
  name,
  label,
  options = [],
  placeholder,
  disabled = false,
  readOnly = false,
  loading = false,
  size = 'medium',
  fullWidth = true,
  freeSolo = false,
  disableClearable = false,
  onInputChange,
  onChange,
  textFieldProps = {},
  isOptionEqualToValue, // optional custom comparator
  getOptionLabel,       // optional custom label getter
  getOptionValue,       // optional custom value getter
  inputValue,           // optional controlled text value
}) {
  const { control } = useFormContext();

  // Default comparators / getters
  const _getOptionValue = getOptionValue || ((opt) => opt?.value);
  const _isOptionEqualToValue = isOptionEqualToValue || ((opt, val) => {
    // val can be full option or primitive (form field value)
    if (val && typeof val === 'object') {
      // if consumer passes an object as value, compare by getOptionValue
      return _getOptionValue(opt) === _getOptionValue(val);
    }
    return _getOptionValue(opt) === val;
  });
  const _getOptionLabel = getOptionLabel || ((opt) => (opt?.label ?? ''));

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        // Map form primitive value -> option object for Autocomplete `value`
        const selectedOption = Array.isArray(options)
          ? options.find((o) => _isOptionEqualToValue(o, field.value)) || null
          : null;

        const mergedTextFieldProps = {
          size,
          margin: 'dense',
          sx: { mb: 2, ...(textFieldProps.sx || {}) },
          ...textFieldProps,
        };

        return (
          <Autocomplete
            options={options}
            value={selectedOption}
            onChange={(_, option) => {
              const nextValue = option ? _getOptionValue(option) : null;
              field.onChange(nextValue);
              if (onChange) onChange(nextValue, option);
            }}
            inputValue={inputValue}
            onInputChange={(_, v, reason) => {
              if (onInputChange) onInputChange(v, reason);
            }}
            getOptionLabel={_getOptionLabel}
            isOptionEqualToValue={_isOptionEqualToValue}
            disableClearable={disableClearable}
            disabled={disabled}
            loading={loading}
            readOnly={readOnly}
            fullWidth={fullWidth}
            freeSolo={freeSolo}
            size={size}
            renderInput={(params) => (
              <TextField
                {...params}
                label={label}
                placeholder={placeholder}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <React.Fragment>
                      {loading ? <CircularProgress color="inherit" size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </React.Fragment>
                  ),
                  readOnly,
                }}
                size={mergedTextFieldProps.size}
                margin={mergedTextFieldProps.margin}
                {...mergedTextFieldProps}
              />
            )}
          />
        );
      }}
    />
  );
}

RHFAutocomplete.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number,
        PropTypes.bool,
        PropTypes.object,
      ]),
      label: PropTypes.string,
    })
  ),
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  readOnly: PropTypes.bool,
  loading: PropTypes.bool,
  size: PropTypes.oneOf(['small', 'medium']),
  fullWidth: PropTypes.bool,
  freeSolo: PropTypes.bool,
  disableClearable: PropTypes.bool,
  onInputChange: PropTypes.func,
  onChange: PropTypes.func,
  textFieldProps: PropTypes.object,
  isOptionEqualToValue: PropTypes.func,
  getOptionLabel: PropTypes.func,
  getOptionValue: PropTypes.func,
  inputValue: PropTypes.string,
};
