import { Controller } from 'react-hook-form';
import { TextField } from '@mui/material';
import { widthMap } from './widthMap';

export default function RHFTextField({ name, control, label, type, isMoney = false, widthVariant, sx, ...rest }) {
  const isNumeric = Boolean(isMoney || type === 'number' || rest.inputMode === 'decimal' || rest.isNumeric);

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const handleChange = (e) => {
          let raw = e.target.value ?? '';
          if (isNumeric) {
            // Remove spaces and currency symbols
            raw = String(raw).replace(/\s+/g, '').replace(/[€$£¥₱]|MXN|USD|EUR/gi, '');
            // Allow leading minus
            const isNegative = raw.startsWith('-');
            raw = isNegative ? raw.slice(1) : raw;
            // Keep only digits and separators
            raw = raw.replace(/[^0-9.,]/g, '');

            // Decide decimal separator using a robust heuristic
            const hasComma = raw.includes(',');
            const hasDot = raw.includes('.');

            // Helper to apply the "shift when 3-digit frac" rule
            const shiftIfThreeFrac = (intPart, fracPart) => {
              if (fracPart.length === 3) {
                // e.g., "24.381" => intPart="24", frac="381" => "243.81"
                return (intPart + fracPart[0]) + '.' + fracPart.slice(1);
              }
              return intPart + '.' + fracPart;
            };

            let normalized;
            if (hasComma && hasDot) {
              // Use the last seen separator as decimal
              const lastComma = raw.lastIndexOf(',');
              const lastDot = raw.lastIndexOf('.');
              const lastIsComma = lastComma > lastDot;
              if (lastIsComma) {
                // Treat commas as decimal; remove dots as thousands
                const tmp = raw.replace(/\.(?=\d)/g, '');
                const [i, f = ''] = tmp.split(',');
                normalized = shiftIfThreeFrac(i, f).replace(',', '.');
              } else {
                // Treat dots as decimal; remove commas as thousands
                const tmp = raw.replace(/,(?=\d)/g, '');
                const [i, f = ''] = tmp.split('.');
                normalized = shiftIfThreeFrac(i, f);
              }
            } else if (hasComma) {
              // Comma only
              const [i, f = ''] = raw.split(',');
              normalized = shiftIfThreeFrac(i.replace(/\.(?=\d)/g, ''), f).replace(',', '.');
            } else if (hasDot) {
              // Dot only
              const [i, f = ''] = raw.split('.');
              normalized = shiftIfThreeFrac(i.replace(/,(?=\d)/g, ''), f);
            } else {
              // Digits only
              normalized = raw;
            }

            // Re-apply minus if present
            if (isNegative && normalized) normalized = '-' + normalized;

            // Allow empty or just '-'
            if (!normalized || normalized === '-') {
              field.onChange(normalized);
              return;
            }

            field.onChange(normalized);
          } else {
            field.onChange(raw);
          }
        };

        const displayValue = (() => {
          if (!isNumeric) return field.value || '';
          const v = field.value;
          if (v === '' || v === null || v === undefined) return '';
          // Preserve transient typing states
          if (typeof v === 'string' && (/[,\.]$/.test(v) || v === '-')) return v;
          // Stored value is normalized with dot-decimal; display with comma-decimal and NO thousands
          const s = String(v);
          // If there are multiple separators (shouldn't happen post-normalization), just replace the last dot with comma
          const lastDot = s.lastIndexOf('.');
          if (lastDot !== -1) {
            return s.slice(0, lastDot) + ',' + s.slice(lastDot + 1);
          }
          // If value came in with comma already, keep it as-is
          return String(v).replace(/\.(?=\d)/g, ',');
        })();

        const widthSx = widthVariant && widthMap[widthVariant] ? widthMap[widthVariant] : undefined;

        return (
          <TextField
            {...field}
            value={displayValue}
            onChange={handleChange}
            label={label}
            margin="dense"
            error={!!fieldState.error}
            helperText={fieldState.error?.message || rest.helperText}
            fullWidth={widthVariant !== 'auto' ? true : rest.fullWidth}
            inputMode={isNumeric ? 'decimal' : rest.inputMode}
            sx={{
              minWidth: 0,
              mb: 2,
              ...(widthSx || {}),
              ...(isMoney ? { '& input': { textAlign: 'right' } } : {}),
              ...(sx || {}),
              ...(rest.sx || {}),
            }}
            {...rest}
          />
        );
      }}
    />
  );
}
