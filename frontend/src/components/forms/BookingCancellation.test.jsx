import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../api';
import BookingEditFormRHF from './BookingEditFormRHF';

jest.mock('../../api', () => ({ get: jest.fn().mockResolvedValue({ data: [] }) }));
jest.mock('../../hooks/useUnitCalendarAvailability', () => () => ({
  hardConflicts: [], softWarnings: [], calendarLoading: false, calendarError: '',
  shouldDisableCalendarDate: () => false,
}));
// Exercise the real RHF wrapper and schemas, with a deterministic picker input.
jest.mock('@mui/x-date-pickers', () => ({ DatePicker: ({ label, value, onChange, minDate, slotProps }) => (
  <div>
    <input aria-label={label} value={value?.isValid() ? value.format('YYYY-MM-DD') : ''}
      min={minDate?.format('YYYY-MM-DD')} onBlur={slotProps.textField.onBlur}
      onChange={(event) => onChange(require('dayjs')(event.target.value))} />
    {slotProps.textField.helperText && <span>{slotProps.textField.helperText}</span>}
  </div>
) }));

beforeEach(() => api.get.mockResolvedValue({ data: [] }));

const values = {
  id: 42, unitId: 7, status: 'Upcoming', source: 'Private', guestName: 'Test Guest', guests: 2,
  checkIn: '2026-11-21', checkOut: '2026-11-22', paymentMethod: 'no_pay',
};


function Editor({ save, initialValues = values }) {
  const [open, setOpen] = React.useState(true);
  return open ? <>
    <BookingEditFormRHF initialValues={initialValues} unitOptions={[{ id: 7, label: 'Test unit' }]}
      onSubmit={async (payload) => { await save(payload); setOpen(false); }} formId="cancel-test" />
    <button type="submit" form="cancel-test">Save booking</button>
  </> : <div>Editor closed</div>;
}

async function selectCancelled() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
  const option = await screen.findByRole('option', { name: 'Cancelled' });
  await act(async () => { fireEvent.click(option); });
}

test('cancelling defaults amounts to zero; Cancel keeps edits open and Confirm saves and closes', async () => {
  const save = jest.fn();
  render(<Editor save={save} initialValues={{ ...values, payout: 1200, cleaningFee: 300 }} />);
  await selectCancelled();
  expect(screen.getByLabelText('Payout')).toHaveValue('0');
  expect(screen.getByLabelText('Cleaning Fee')).toHaveValue('0');
  expect(screen.getByLabelText('Cleaning Fee')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save booking' }));
  expect(await screen.findByRole('dialog', { name: 'Confirm Cancellation?' })).toBeVisible();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Payout')).toHaveValue('0');
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save booking' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm', exact: true }));
  await screen.findByText('Editor closed');
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ status: 'Cancelled', payout: 0, cleaningFee: 0 }));
});

test('manual payout override survives confirmation and reopening an already cancelled booking', async () => {
  const save = jest.fn();
  const initialValues = { ...values, payout: 1200, cleaningFee: 300 };
  const { unmount } = render(<Editor save={save} initialValues={initialValues} />);
  await selectCancelled();
  fireEvent.change(screen.getByLabelText('Payout'), { target: { value: '250.50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save booking' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm', exact: true }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ payout: 250.5, cleaningFee: 0 })));
  unmount();
  await act(async () => {
    render(<Editor save={save} initialValues={{ ...initialValues, status: 'Cancelled', payout: 250.5, cleaningFee: 0 }} />);
  });
  expect(screen.getByLabelText('Payout')).toHaveValue('250.5');
});

test('ordinary saves do not require cancellation confirmation', async () => {
  const save = jest.fn();
  render(<Editor save={save} initialValues={{ ...values, payout: 1200, cleaningFee: 300 }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save booking' }));
  await screen.findByText('Editor closed');
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ status: 'Upcoming', payout: 1200, cleaningFee: 300 }));
});
