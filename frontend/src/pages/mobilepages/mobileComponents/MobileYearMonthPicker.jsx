import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * MobileYearMonthPicker
 * @param {object} props
 * @param {string} props.value - "YYYY-MM"
 * @param {function} props.onChange - onChange(newValueString: "YYYY-MM")
 * @param {boolean} [props.disabled=false]
 */
export default function MobileYearMonthPicker({ value, onChange, disabled = false }) {
  // Parse value ("YYYY-MM") → year, month
  let year, month;

  if (typeof value === 'string' && value.includes('-')) {
    const [yStr, mStr] = value.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (y && m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }

  // Fallback to current year/month
  if (!year || !month) {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const monthName = MONTH_NAMES[month - 1] || '';

  const emit = (y, m) => {
    if (!onChange) return;
    const formatted = `${y}-${String(m).padStart(2, '0')}`;
    onChange(formatted);
  };

  const handlePrevMonth = () => {
    let y = year;
    let m = month - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    emit(y, m);
  };

  const handleNextMonth = () => {
    let y = year;
    let m = month + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    emit(y, m);
  };

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      gap={1}
      padding="4px 8px"
    >
      <IconButton onClick={handlePrevMonth} disabled={disabled} size="small">
        <ChevronLeftIcon width={20} height={20} />
      </IconButton>

      <Typography variant="subtitle1">
        {monthName}
      </Typography>

      <IconButton onClick={handleNextMonth} disabled={disabled} size="small">
        <ChevronRightIcon width={20} height={20} />
      </IconButton>
    </Box>
  );
}