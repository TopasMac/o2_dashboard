import React, { useEffect } from 'react';
import { Box, Typography, FormControl, InputLabel, Select, MenuItem, TextField, CircularProgress } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';

/**
 * Generic page shell with a standardized header and an optional filter toolbar.
 *
 * Props:
 *  - title: string
 *  - description?: string
 *  - filters?: {
 *      year?: number | string,
 *      years?: Array<number | string>,
 *      onYearChange?: (e: any) => void,
 *      month?: number | string,
 *      months?: Array<{ value: number | string; label: string }>,
 *      onMonthChange?: (e: any) => void,
 *      // Unit text query (used for Autocomplete inputValue or plain TextField value)
 *      unitQuery?: string,
 *      onUnitQueryChange?: (e: any) => void,
 *      // Optional Autocomplete wiring (if provided, we render a dropdown)
 *      unitOptions?: Array<{ id: number|string; value?: number|string; label: string }>,
 *      unitSelectedId?: number | string | null,
 *      unitSelectedLabel?: string,
 *      unitLoading?: boolean,
 *      onUnitSelect?: (optOrId: any) => void,
 *    }
 *  - extraFilters?: React.ReactNode   // for injecting additional selects/fields (e.g., Service)
 *  - actions?: React.ReactNode        // right-aligned action buttons (e.g., Preview / Export)
 */
const PageLayoutWithFilters = ({ title, description, filters, extraFilters, actions, children, setFilters, onSearch }) => {
  const {
    year,
    years,
    onYearChange,
    month,
    months,
    onMonthChange,
    unitQuery,
    onUnitQueryChange,
    unitOptions = [],
    unitSelectedId = null,
    unitSelectedLabel = '',
    unitLoading = false,
    onUnitSelect,
  } = filters || {};

  const yearList = years ?? [];
  const monthList = months ?? [];

  // Normalize month options to { value: 1..12, label: string }
  const normalizedMonthList = (monthList || []).map((m) => {
    if (m && typeof m === 'object') {
      const raw = (m.value ?? m.month ?? m.id ?? m);
      const val = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
      const label = (m.label ?? String(raw));
      return { value: val, label };
    }
    const val = typeof m === 'number' ? m : parseInt(String(m).replace(/[^0-9]/g, ''), 10);
    return { value: val, label: String(m) };
  }).filter((mm) => Number.isFinite(mm.value) && mm.value >= 1 && mm.value <= 12);

  // Built-in fallback options for months (1..12)
  const MONTH_OPTIONS = [
    { value: 1,  label: '1. Jan' },
    { value: 2,  label: '2. Feb' },
    { value: 3,  label: '3. Mar' },
    { value: 4,  label: '4. Apr' },
    { value: 5,  label: '5. May' },
    { value: 6,  label: '6. Jun' },
    { value: 7,  label: '7. Jul' },
    { value: 8,  label: '8. Aug' },
    { value: 9,  label: '9. Sep' },
    { value: 10, label: '10. Oct' },
    { value: 11, label: '11. Nov' },
    { value: 12, label: '12. Dec' },
  ];

  // Always have something to render
  const monthOptions = normalizedMonthList.length ? normalizedMonthList : MONTH_OPTIONS;

  const buildMonthRangeCancun = (y, m /* 1-12 */) => {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  };

  const handleMonthChange = (e) => {
    const raw = e.target.value;
    const m = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/[^0-9]/g, ''), 10) || 1;
    if (typeof setFilters === 'function' && filters) {
      const y = Number(filters.year) || new Date().getFullYear();
      const { start, end } = buildMonthRangeCancun(y, m);
      setFilters(prev => ({ ...prev, month: m, year: y, start, end, page: 1 }));
    } else if (typeof onMonthChange === 'function') {
      onMonthChange(e);
    }
  };

  const handleYearChange = (e) => {
    const y = Number(e.target.value);
    if (typeof setFilters === 'function' && filters) {
      const m = Number(filters.month) || 1;
      const { start, end } = buildMonthRangeCancun(y, m);
      setFilters(prev => ({ ...prev, year: y, start, end, page: 1 }));
    } else if (typeof onYearChange === 'function') {
      onYearChange(e);
    }
  };


  return (
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        {title}
      </Typography>

      {description && (
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {description}
        </Typography>
      )}

      {filters && (
        <Box display="flex" gap={2} mb={2} flexWrap="wrap" alignItems="center">
          {/* Year */}
          {yearList.length > 0 && (
            <TextField
              select
              label="Year"
              size="small"
              value={filters?.year ? Number(filters.year) : ''}
              onChange={handleYearChange}
              sx={{ minWidth: 100 }}
              SelectProps={{
                MenuProps: { disablePortal: true, keepMounted: true }
              }}
            >
              <MenuItem value="">
                <em>Select Year</em>
              </MenuItem>
              {yearList.map((y) => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </TextField>
          )}

          {/* Month */}
          {monthList.length > 0 && (
            <TextField
              select
              label="Month"
              size="small"
              value={filters?.month ? Number(filters.month) : ''}
              onChange={handleMonthChange}
              sx={{ minWidth: 120 }}
              SelectProps={{
                MenuProps: { disablePortal: true, keepMounted: true }
              }}
            >
              <MenuItem value="">
                <em>Select Month</em>
              </MenuItem>
              {monthOptions.map(m => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </TextField>
          )}

          {/* Unit search */}
          {(typeof unitQuery !== 'undefined' || typeof onUnitQueryChange === 'function') && (
            unitOptions && unitOptions.length > 0 && typeof onUnitSelect === 'function' ? (
              <Autocomplete
                size="small"
                options={unitOptions}
                getOptionLabel={(opt) => (opt && typeof opt === 'object' ? (opt.label ?? '') : String(opt ?? ''))}
                isOptionEqualToValue={(opt, val) => {
                  const oid = opt?.id ?? opt?.value ?? opt;
                  const vid = val?.id ?? val?.value ?? val;
                  return String(oid) === String(vid);
                }}
                value={(() => {
                  const byId = unitOptions.find(o => String(o.id ?? o.value) === String(unitSelectedId));
                  return byId || null;
                })()}
                inputValue={unitQuery ?? ''}
                onInputChange={(_, newInput) => {
                  if (typeof onUnitQueryChange === 'function') {
                    // Normalize to event-like shape
                    onUnitQueryChange({ target: { value: newInput } });
                  }
                }}
                onChange={(_, newValue) => {
                  if (typeof onUnitSelect === 'function') {
                    onUnitSelect(newValue);
                  }
                }}
                loading={!!unitLoading}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Unit"
                    variant="outlined"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {unitLoading ? <CircularProgress size={16} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                sx={{ minWidth: 260 }}
              />
            ) : (
              <TextField
                size="small"
                variant="outlined"
                label="Unit"
                value={unitQuery ?? ''}
                onChange={onUnitQueryChange}
              />
            )
          )}

          {/* Extra filters slot (e.g., Service select) */}
          {extraFilters}

          {/* Push actions to the right when there is room */}
          <Box sx={{ flexGrow: 1 }} />

          {/* Actions slot (e.g., Preview / Export buttons) */}
          {actions && <Box display="flex" gap={1}>{actions}</Box>}
        </Box>
      )}

      <Box mt={2}>
        {children}
      </Box>
    </Box>
  );
};

export default PageLayoutWithFilters;