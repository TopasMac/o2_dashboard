import React from 'react';
import PropTypes from 'prop-types';
import { Controller, useFormContext } from 'react-hook-form';
import { FormControl, FormHelperText, IconButton, Tooltip, Box } from '@mui/material';
import { PaperClipIcon } from '@heroicons/react/24/outline';

export const RHFFileClipIcon = (props) => (
  <PaperClipIcon style={{ width: 22, height: 22, color: '#1E6F68', ...(props?.style || {}) }} {...props} />
);

/**
 * RHFFile
 * -----------------------------------------------------------------------------
 * Reusable file input wired to react-hook-form with MUI outlined styling.
 * - Supports single file by default; enable `multiple` for an array of Files.
 * - Stores `File|null` (single) or `File[]` (multiple) in RHF.
 * - Shows selected file name(s) as helper text when no error is present.
 *
 * NOTE: Browsers disallow programmatically setting the value of a file input.
 *       We therefore do NOT bind `value` to RHF; we only push changes via onChange.
 */
export default function RHFFile({
  name,
  label,
  accept,
  multiple = false,
  helperText,
  sx,
  widthVariant = 'full',
  onFileChange, // optional callback (file | File[] | null) => void
  ...other
}) {
  const { control } = useFormContext();

  const getNames = (val) => {
    if (!val) return '';
    if (Array.isArray(val)) return val.map((f) => f?.name).filter(Boolean).join(', ');
    return val?.name || '';
  };

  const widthMap = {
    full: { width: '100%' },
    twoThirds: { width: '66.6667%', minWidth: 420 },
    half: { width: '50%', minWidth: 300 },
    third: { width: '33.3333%', minWidth: 220 },
    quarter: { width: '25%', minWidth: 180 },
    auto: {},
  };
  const widthSx = widthMap[widthVariant] || widthMap.full;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const { onChange } = field;
        const { error } = fieldState;

        const handleChange = (e) => {
          const filesList = e.target.files ? Array.from(e.target.files) : [];
          const payload = multiple ? filesList : (filesList[0] || null);
          onChange(payload);
          if (typeof onFileChange === 'function') onFileChange(payload);
        };

        // We intentionally do not pass a `value` to TextField for file inputs.
        return (
          <FormControl
            fullWidth={widthVariant !== 'auto'}
            error={!!error}
            sx={{ ...(widthSx || {}), ...(sx || {}), ...(other.sx || {}) }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.05, mb: 0.05 }}>
              <input
                id={`file-input-${name}`}
                name={name}
                type="file"
                accept={accept}
                multiple={multiple}
                hidden
                onChange={handleChange}
              />
              <label htmlFor={`file-input-${name}`}>
                <Tooltip title={label || 'Attach file'}>
                  <IconButton component="span" color={error ? 'error' : 'default'} size="small">
                    <PaperClipIcon style={{ width: 22, height: 22, color: '#1E6F68' }} />
                  </IconButton>
                </Tooltip>
              </label>
              <Box sx={{ fontSize: '0.875rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getNames(field.value) || helperText || 'No file chosen'}
              </Box>
            </Box>
            {error && <FormHelperText>{error.message}</FormHelperText>}
          </FormControl>
        );
      }}
    />
  );
}

RHFFile.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.oneOfType([PropTypes.node, PropTypes.string]),
  accept: PropTypes.string,
  multiple: PropTypes.bool,
  helperText: PropTypes.oneOfType([PropTypes.node, PropTypes.string]),
  sx: PropTypes.object,
  onFileChange: PropTypes.func,
  widthVariant: PropTypes.oneOf(['full','twoThirds','half','third','quarter','auto']),
};