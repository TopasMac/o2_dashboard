import React, { useMemo, useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  IconButton,
  Button,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

const MONTHS = [
  { num: 1, label: 'Jan' },
  { num: 2, label: 'Feb' },
  { num: 3, label: 'Mar' },
  { num: 4, label: 'Apr' },
  { num: 5, label: 'May' },
  { num: 6, label: 'Jun' },
  { num: 7, label: 'Jul' },
  { num: 8, label: 'Aug' },
  { num: 9, label: 'Sep' },
  { num: 10, label: 'Oct' },
  { num: 11, label: 'Nov' },
  { num: 12, label: 'Dec' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseYm(ym) {
  // expects YYYY-MM
  if (!ym || typeof ym !== 'string') return null;
  const m = ym.match(/^\d{4}-\d{2}$/);
  if (!m) return null;
  const [yStr, moStr] = ym.split('-');
  const y = Number(yStr);
  const mo = Number(moStr);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  return { y, mo };
}

function ymToKey(y, mo) {
  // monotonically increasing key for comparisons
  return y * 12 + (mo - 1);
}

/**
 * YearMonthJumpDialog
 *
 * Props:
 * - open: boolean
 * - valueYm: string (YYYY-MM) used to preselect month/year
 * - minYm?: string (YYYY-MM)
 * - maxYm?: string (YYYY-MM)
 * - title?: string
 * - onClose: () => void
 * - onSelect: (ym: string) => void
 */
export default function YearMonthJumpDialog({
  open,
  valueYm,
  minYm,
  maxYm,
  title = 'Choose month',
  onClose,
  onSelect,
}) {
  const parsedValue = useMemo(() => parseYm(valueYm), [valueYm]);
  const parsedMin = useMemo(() => parseYm(minYm), [minYm]);
  const parsedMax = useMemo(() => parseYm(maxYm), [maxYm]);

  const [year, setYear] = useState(() => parsedValue?.y ?? new Date().getFullYear());

  // Keep internal year in sync when opening / value changes
  useEffect(() => {
    if (!open) return;
    setYear(parsedValue?.y ?? new Date().getFullYear());
  }, [open, parsedValue?.y]);

  const minKey = parsedMin ? ymToKey(parsedMin.y, parsedMin.mo) : null;
  const maxKey = parsedMax ? ymToKey(parsedMax.y, parsedMax.mo) : null;

  const canDecYear = useMemo(() => {
    if (!parsedMin) return true;
    return year > parsedMin.y;
  }, [year, parsedMin]);

  const canIncYear = useMemo(() => {
    if (!parsedMax) return true;
    return year < parsedMax.y;
  }, [year, parsedMax]);

  const selectedMo = parsedValue?.y === year ? parsedValue.mo : null;

  function isDisabledMonth(mo) {
    const k = ymToKey(year, mo);
    if (minKey != null && k < minKey) return true;
    if (maxKey != null && k > maxKey) return true;
    return false;
  }

  function handleSelect(mo) {
    const ym = `${year}-${pad2(mo)}`;
    onSelect?.(ym);
  }

  return (
    <Dialog open={!!open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => setYear((y) => y - 1)}
              disabled={!canDecYear}
              aria-label="Previous year"
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Typography sx={{ minWidth: 72, textAlign: 'center', fontWeight: 700 }}>{year}</Typography>
            <IconButton
              size="small"
              onClick={() => setYear((y) => y + 1)}
              disabled={!canIncYear}
              aria-label="Next year"
            >
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5, pb: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1,
          }}
        >
          {MONTHS.map(({ num, label }) => {
            const disabled = isDisabledMonth(num);
            const selected = selectedMo === num;
            return (
              <Button
                key={num}
                variant={selected ? 'contained' : 'outlined'}
                onClick={() => handleSelect(num)}
                disabled={disabled}
                sx={{
                  minHeight: 42,
                  fontWeight: 700,
                  textTransform: 'none',
                }}
              >
                {label}
              </Button>
            );
          })}
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button onClick={onClose} variant="text">
            Cancel
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}