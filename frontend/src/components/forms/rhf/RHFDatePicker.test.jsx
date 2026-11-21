import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import RHFDatePicker from './RHFDatePicker';

function Harness() {
  const { control, setError } = useForm({ defaultValues: { checkOut: '2026-11-22' } });
  return <LocalizationProvider dateAdapter={AdapterDayjs}>
    <button onClick={() => setError('checkOut', { message: 'Check-out must be after check-in' })}>Validate</button>
    <RHFDatePicker name="checkOut" label="Check Out" control={control} minDate={dayjs('2026-11-22')} showValidation />
  </LocalizationProvider>;
}

test('checkout calendar disables dates through check-in and allows the following day', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /choose date/i }));
  expect(screen.getByRole('gridcell', { name: '1', exact: true })).toBeDisabled();
  expect(screen.getByRole('gridcell', { name: '21', exact: true })).toBeDisabled();
  expect(screen.getByRole('gridcell', { name: '22', exact: true })).not.toBeDisabled();
});

test('renders a visible field error with the real MUI picker', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
  expect(screen.getByText('Check-out must be after check-in')).toBeVisible();
});
