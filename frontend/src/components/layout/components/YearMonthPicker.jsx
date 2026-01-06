import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  IconButton,
  InputAdornment,
  TextField,
  Menu,
  MenuItem,
} from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

// Utility: shift YYYY-MM string by delta months
function shiftYm(ym, delta) {
  if (!ym) return ym;
  const [yStr, mStr] = ym.split('-');
  let year = Number(yStr);
  let month = Number(mStr);

  month += delta;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Utility: format YYYY-MM into "Month YYYY"
function formatYm(ym) {
  if (!ym) return '';
  const [yStr, mStr] = ym.split('-');
  const idx = Number(mStr) - 1;
  return `${MONTH_NAMES[idx] || ''} ${yStr}`;
}

// Parse a free‑typed value into YYYY-MM if possible
function parseToYm(input) {
  if (!input) return null;
  const raw = input.trim();

  // Try "Month YYYY" or "Mon YYYY"
  const monthMatch = raw.match(/^([A-Za-zÀ-ÿ\.]+)\s+(\d{4})$/);
  if (monthMatch) {
    const [, mNameRaw, yStr] = monthMatch;
    const mName = mNameRaw.replace('.', '').toLowerCase();
    const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(mName));
    if (idx >= 0) {
      const year = Number(yStr);
      const month = idx + 1;
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }

  // Try "YYYY-MM" or "YYYY/MM"
  let isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})$/);
  if (!isoMatch) {
    // Try "MM/YYYY" or "M/YYYY"
    isoMatch = raw.match(/^(\d{1,2})[-/](\d{4})$/);
    if (isoMatch) {
      const [_, mStr, yStr] = isoMatch;
      const year = Number(yStr);
      const month = Number(mStr);
      if (month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, '0')}`;
      }
    }
  } else {
    const [_, yStr, mStr] = isoMatch;
    const year = Number(yStr);
    const month = Number(mStr);
    if (month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }

  return null;
}

const YearMonthPicker = ({ value, onChange, label = 'Month', sx, options }) => {
  const formatted = useMemo(() => formatYm(value), [value]);
  const [inputValue, setInputValue] = useState(formatted);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  // Compute options: use props if provided, otherwise build a small range around the current value
  const computedOptions = useMemo(() => {
    if (options && options.length) {
      return options;
    }
    // Fallback: build [-5, +1] month window around current value or around "now"
    const baseYm =
      value ||
      (() => {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        return `${now.getFullYear()}-${mm}`;
      })();

    const out = [];
    for (let delta = -5; delta <= 1; delta += 1) {
      const ym = shiftYm(baseYm, delta);
      out.push({ value: ym, label: formatYm(ym) });
    }
    return out;
  }, [options, value]);

  // Keep local input in sync when parent value changes
  useEffect(() => {
    setInputValue(formatted);
  }, [formatted]);

  const handleShift = (delta) => {
    if (!onChange) return;
    const base = value || computedOptions[0]?.value;
    const next = shiftYm(base, delta);
    if (next) {
      onChange(next);
    }
  };

  const commitTypedValue = () => {
    const parsed = parseToYm(inputValue);
    if (onChange && parsed) {
      onChange(parsed);
    } else {
      // Reset to last valid value if parsing fails or no onChange
      setInputValue(formatted);
    }
  };

  const handleOpenMenu = (event) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
  };

  const handleSelectOption = (ym) => {
    handleCloseMenu();
    if (onChange) {
      onChange(ym);
    }
  };

  return (
    <Box sx={{ minWidth: 235, ...(sx || {}) }}>
      <TextField
        fullWidth
        size="small"
        label={label}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={commitTypedValue}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitTypedValue();
          }
        }}
        autoComplete="off"
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                edge="end"
                tabIndex={-1}
                onClick={() => handleShift(-1)}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                edge="end"
                tabIndex={-1}
                onClick={() => handleShift(1)}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                edge="end"
                tabIndex={-1}
                onClick={handleOpenMenu}
              >
                <CalendarTodayIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />

      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {computedOptions.map((opt) => (
          <MenuItem
            key={opt.value}
            selected={opt.value === value}
            onClick={() => handleSelectOption(opt.value)}
          >
            {opt.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default YearMonthPicker;