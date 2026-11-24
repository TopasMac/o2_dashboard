import React from 'react';
import { Button, Dialog, DialogActions, DialogTitle } from '@mui/material';

export default function HKCancelDialog({ row, onClose, onConfirm }) {
  const date = row?.service_date?.split('-').reverse().join('-') || '—';
  return (
    <Dialog open={Boolean(row)} onClose={onClose} aria-labelledby="hk-cancel-title">
      <DialogTitle id="hk-cancel-title">Confirm Cancel {row?.unit_name} on {date}?</DialogTitle>
      <DialogActions>
        <Button variant="contained" sx={{ bgcolor: (theme) => theme.hausin?.colors?.primaryTeal || '#1E6F68', '&:hover': { bgcolor: '#185952' } }} onClick={() => { onClose(); onConfirm(row); }}>Confirm</Button>
        <Button autoFocus sx={{ color: (theme) => theme.hausin?.colors?.danger || '#D9534F' }} onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
