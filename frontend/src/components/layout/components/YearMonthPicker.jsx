import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  IconButton,
  TextField,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';

import YearMonthJumpDialog from './YearMonthJumpDialog';

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

// Utility: get current YYYY-MM
function getCurrentYm() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${mm}`;
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

// Utility: format YYYY-MM into "Month/YYYY"
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

const YearMonthPicker = ({
  value,
  onChange,
  label = 'Month',
  sx,
  options,
  minYm,
  maxYm,
  jumpTitle = 'Choose month',
}) => {
  const formatted = useMemo(() => formatYm(value), [value]);
  const [inputValue, setInputValue] = useState(formatted);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const inputAnchorRef = useRef(null);
  const [jumpOpen, setJumpOpen] = useState(false);

  const currentYm = useMemo(() => getCurrentYm(), []);

  // Compute options: use props if provided, otherwise build a small range around the current value
  const computedOptions = useMemo(() => {
    if (options && options.length) {
      // Normalize labels + sort ascending (previous -> future)
      return [...options]
        .map((o) => ({
          value: o.value,
          label: formatYm(o.value),
        }))
        .sort((a, b) => a.value.localeCompare(b.value));
    }
    // Fallback: build [present -3, present +2] month window around "now"
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const baseYm = `${now.getFullYear()}-${mm}`;

    const start = shiftYm(baseYm, -3);
    const end = shiftYm(baseYm, 2);

    const out = [];
    let cursor = start;
    while (cursor.localeCompare(end) <= 0) {
      out.push({ value: cursor, label: formatYm(cursor) });
      cursor = shiftYm(cursor, 1);
    }

    // previous -> future
    return out.sort((a, b) => a.value.localeCompare(b.value));
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

  const handleClear = () => {
    setInputValue('');
    if (onChange) {
      onChange('');
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
    const el = inputAnchorRef.current || event?.currentTarget || null;
    setMenuAnchorEl(el);
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

  const handleOpenJump = () => {
    handleCloseMenu();
    setJumpOpen(true);
  };

  const handleJumpClose = () => {
    setJumpOpen(false);
  };

  const handleJumpSelect = (ym) => {
    setJumpOpen(false);
    if (onChange) {
      onChange(ym);
    }
  };

  // Prevent dropdown menu opening when clicking end-adornment buttons
  const stopMenuOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Box sx={{ minWidth: 235, ...(sx || {}) }}>
      <Box ref={inputAnchorRef} sx={{ width: '100%' }}>
        <TextField
          fullWidth
          size="small"
          label={label}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={commitTypedValue}
          onFocus={handleOpenMenu}
          onClick={handleOpenMenu}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTypedValue();
            }
          }}
          autoComplete="off"
          InputProps={{
            endAdornment: (
              <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                {value && (
                  <IconButton
                    size="small"
                    edge="end"
                    tabIndex={-1}
                    onMouseDown={stopMenuOpen}
                    onClick={(e) => {
                      stopMenuOpen(e);
                      handleClear();
                    }}
                    title="Clear month filter"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  edge="end"
                  tabIndex={-1}
                  onMouseDown={stopMenuOpen}
                  onClick={(e) => {
                    stopMenuOpen(e);
                    handleShift(-1);
                  }}
                >
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  edge="end"
                  tabIndex={-1}
                  onMouseDown={stopMenuOpen}
                  onClick={(e) => {
                    stopMenuOpen(e);
                    handleShift(1);
                  }}
                >
                  <ChevronRightIcon fontSize="small" />
                </IconButton>
              </Box>
            ),
          }}
        />
      </Box>

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
            sx={
              opt.value === currentYm
                ? { color: '#1e6f68', fontWeight: 700 }
                : undefined
            }
          >
            {opt.label}
          </MenuItem>
        ))}

        <Divider />

        <MenuItem onClick={handleOpenJump}>
          Choose month…
        </MenuItem>
      </Menu>

      <YearMonthJumpDialog
        open={jumpOpen}
        valueYm={value}
        minYm={minYm}
        maxYm={maxYm}
        title={jumpTitle}
        onClose={handleJumpClose}
        onSelect={handleJumpSelect}
      />
    </Box>
  );
};

export default YearMonthPicker;