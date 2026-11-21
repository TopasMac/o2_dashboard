import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../api';
import BookingEditFormRHF from './BookingEditFormRHF';
import BookingNewFormRHF from './BookingNewFormRHF';

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

for (const mode of ['edit', 'new']) {
  test(`${mode}: limits checkout, rejects typed reversal and revalidates after check-in changes`, async () => {
    const save = jest.fn();
    render(<>{mode === 'edit'
      ? <BookingEditFormRHF initialValues={values} unitOptions={[{ id: 7, label: 'Test unit' }]} onSubmit={save} formId="date-test" />
      : <BookingNewFormRHF initialUnit={{ id: 7, label: 'Test unit' }} initialCheckIn={values.checkIn} initialCheckOut={values.checkOut} onSubmit={save} formId="date-test" />}<button type="submit" form="date-test">Submit booking</button></>);
    const checkout = screen.getByLabelText('Check Out');
    expect(checkout).toHaveAttribute('min', '2026-11-22');
    fireEvent.change(checkout, { target: { value: '2026-11-01' } });
    expect(await screen.findByText('Check-out must be after check-in')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Submit booking' }));
    await waitFor(() => expect(save).not.toHaveBeenCalled());
    fireEvent.change(checkout, { target: { value: '2026-11-22' } });
    await waitFor(() => expect(screen.queryByText('Check-out must be after check-in')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Submit booking' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(mode === 'edit' ? 1 : 0));
    fireEvent.change(screen.getByLabelText('Check In'), { target: { value: '2026-11-23' } });
    expect(checkout).toHaveAttribute('min', '2026-11-24');
    expect(await screen.findByText('Check-out must be after check-in')).toBeVisible();
  });
}
