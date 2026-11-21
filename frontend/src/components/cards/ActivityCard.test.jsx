/* eslint-disable testing-library/no-node-access -- jsdom requires direct access to open the native disclosure. */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../../api';
import ActivityCard from './ActivityCard';

jest.mock('../../api', () => ({ get: jest.fn(), put: jest.fn() }));

jest.mock('../forms/BookingEditFormRHF', () => ({ formId, initialValues, onSubmit }) => (
  <form id={formId} onSubmit={(event) => {
    event.preventDefault();
    onSubmit(initialValues);
  }}>
    <p>{initialValues.checkInNotes}</p>
  </form>
));

test('counts scheduled jobs and extra cleanings together for the selected city and day', async () => {
  api.get.mockImplementation(async (url, { params }) => {
    const day = new Date(params.start + 'T12:00:00Z');
    day.setUTCDate(day.getUTCDate() + 1);
    const scheduledDate = day.toISOString().slice(0, 10);

    if (url === '/api/bookings/check-activity') {
      return { data: [{
        city: 'Tulum', unit_name: 'Cleaning unit', service_date: scheduledDate,
        event_cleaning_only: true, hk_cleaning_id: 1,
      }] };
    }
    expect(url).toBe('/api/service-jobs/activity');
    return { data: { jobs: [
      {
        id: 1, city: 'Tulum', scheduledDate, unitName: 'Job unit', status: 'done',
        description: 'Repair the pump', notes: 'Use the side entrance', providerName: 'Pump Services',
      },
      { id: 2, city: 'Tulum', scheduledDate: params.end, description: 'Later job' },
    ] } };
  });

  render(<ActivityCard showServiceJobs />);
  const tulum = (await screen.findByRole('heading', { name: 'Tulum' })).parentElement;
  const section = within(tulum).getByText('Servicios').closest('details');
  expect(section).not.toHaveAttribute('open');
  expect(within(section).getByText('(2)')).toBeInTheDocument();
  section.open = true;
  expect(within(section).getByRole('link', { name: /Done.*Job unit/ })).toHaveAttribute('href', '/service-jobs?job=1');
  for (const text of ['Cleaning unit', 'Job unit', 'Done', 'Repair the pump', /Use the side entrance/, /Pump Services/]) {
    expect(within(section).getByText(text)).toBeVisible();
  }
  expect(screen.queryByText('Later job')).not.toBeInTheDocument();
});

test('opens and saves the selected check-in on the dashboard', async () => {
  const booking = { id: 42, unitId: 7, checkInNotes: 'Use the front desk', isPaid: true };
  api.put.mockResolvedValue({});
  api.get.mockImplementation(async (url, options) => {
    if (url === '/api/bookings/42') return { data: booking };
    if (url === '/api/units/options') return { data: [{ id: 7, unit_name: 'Test unit' }] };
    const { params } = options;
    expect(url).toBe('/api/bookings/check-activity');
    const day = new Date(params.start + 'T12:00:00Z');
    day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    return { data: [{
      id: 42, city: 'Tulum', unit_name: 'Test unit', guest: 'Test Guest',
      check_in: date, check_out: date, event_check_in: true, event_check_out: true,
    }] };
  });

  render(<ActivityCard />);
  const tulum = (await screen.findByRole('heading', { name: 'Tulum' })).parentElement;
  const checkIn = within(tulum).getByText('CheckIn').closest('details');
  const checkOut = within(tulum).getByText('CheckOut').closest('details');
  checkIn.open = true;
  checkOut.open = true;
  expect(within(checkOut).getByText('Test unit')).toBeVisible();
  fireEvent.click(within(checkIn).getByRole('button', { name: 'Editar reserva de Test unit, Test Guest' }));

  const dialog = await screen.findByRole('dialog', { name: 'Editar reserva · Test unit' });
  expect(await within(dialog).findByText('Use the front desk')).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/bookings/42', booking, expect.any(Object)));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByRole('heading', { name: /Actividad hoy/ })).toBeVisible();
});

test('edits checkout and checklist notes together and retries only the failed update', async () => {
  api.get.mockImplementation(async (url, { params }) => {
    expect(url).toBe('/api/bookings/check-activity');
    const day = new Date(params.start + 'T12:00:00Z');
    day.setUTCDate(day.getUTCDate() + 1);
    return { data: [{
      id: 42, city: 'Tulum', unit_name: 'Test unit', guest: 'Test Guest',
      check_out: day.toISOString().slice(0, 10), event_check_out: true,
      hk_cleaning_id: 73, check_out_notes: 'Leave keys', cleaner_notes: 'Check towels',
    }] };
  });
  api.put.mockClear()
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce({ response: { data: { error: 'Cleaning update failed' } } })
    .mockResolvedValueOnce({});

  render(<ActivityCard />);
  const tulum = (await screen.findByRole('heading', { name: 'Tulum' })).parentElement;
  const checkout = within(tulum).getByText('CheckOut').closest('details');
  checkout.open = true;
  fireEvent.click(within(checkout).getByRole('button', { name: /Editar reserva/ }));

  const dialog = await screen.findByRole('dialog', { name: /Editar check-out/ });
  expect(within(dialog).getByText('Test unit')).toBeVisible();
  expect(within(dialog).getByText('Test Guest')).toBeVisible();
  const checkoutNotes = within(dialog).getByRole('textbox', { name: 'Notas Checkout' });
  const cleaningNotes = within(dialog).getByRole('textbox', { name: 'Notas Limpieza' });
  expect(checkoutNotes).toHaveValue('Leave keys');
  expect(cleaningNotes).toHaveValue('Check towels');
  fireEvent.change(checkoutNotes, { target: { value: 'Return keys' } });
  fireEvent.change(cleaningNotes, { target: { value: 'Replace towels' } });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cleaning update failed');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.put.mock.calls).toEqual([
    ['/api/bookings/42', { checkOutNotes: 'Return keys' }],
    ['/api/hk-cleanings/73/notes', { cleanerNotes: 'Replace towels' }],
    ['/api/hk-cleanings/73/notes', { cleanerNotes: 'Replace towels' }],
  ]);
});
