import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HKCleaningsRecon from './HKCleaningsRecon';
import api from '../api';

jest.mock('../api', () => ({ get: jest.fn(), put: jest.fn(), post: jest.fn() }));
jest.mock('../components/layout/PageScaffold', () => ({ children, stickyHeader }) => <div>{stickyHeader}{children}</div>);
jest.mock('../components/common/AppDrawer', () => () => null);
jest.mock('../components/forms/HKCleaningsEditFormRHF', () => () => null);
jest.mock('../components/drawers/HKReconMonthNotesDrawer', () => () => null);
jest.mock('../components/layout/components/YearMonthPicker', () => () => <span>Month picker</span>);

function setup(city, status = 'done') {
  let row = { id: 42, hk_cleaning_id: 42, unit_id: 1, unit_name: 'Synthetic Unit', city,
    service_date: '2026-11-23', status, report_status: 'reported',
    display_status: null, cleaning_cost: '300.00', laundry_cost: '0.00', charged_cost: '900.00' };
  api.get.mockImplementation(async (url) => ({ data: { data: url.startsWith('/api/hk-reconcile?') ? [row] : [] } }));
  api.put.mockImplementation(async (_url, payload) => {
    row = { ...row, status: payload.status, display_status: null, report_status: payload.status === 'pending' ? 'pending' : 'reported' };
    return { data: { ok: true } };
  });
  api.put.mockClear();
  render(<HKCleaningsRecon />);
}
const getRow = () => screen.getByText('Synthetic Unit').closest('tr');

test.each(['Tulum', 'Playa del Carmen'])('confirms cancellation and retains the %s row', async (city) => {
  setup(city);
  await screen.findByText('Synthetic Unit');
  fireEvent.mouseDown(within(getRow()).getByRole('combobox'));
  expect(screen.getAllByRole('option').at(-1)).toHaveTextContent('Cancelled');
  fireEvent.click(screen.getByRole('option', { name: 'Cancelled' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(within(getRow()).getByRole('combobox')).toHaveTextContent('Cancelled'));
  expect(api.put).toHaveBeenCalledWith('/api/hk-reconcile/42/status', { status: 'cancelled' });
});

test.each(['Tulum', 'Playa del Carmen'])('filters cancelled %s rows and reopens them to Pending', async (city) => {
  setup(city, 'cancelled');
  await screen.findByText('Synthetic Unit');
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
  expect(screen.getAllByRole('option').at(-1)).toHaveTextContent('Cancelled');
  fireEvent.click(screen.getByRole('option', { name: 'Cancelled' }));
  expect(getRow()).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
  fireEvent.click(screen.getByRole('option', { name: 'All' }));
  fireEvent.mouseDown(within(getRow()).getByRole('combobox', { hidden: true }));
  fireEvent.click(screen.getByRole('option', { name: 'Pending' }));
  await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/api/hk-reconcile/42/status', { status: 'pending' }));
  await waitFor(() => expect(within(getRow()).getByRole('combobox')).toHaveTextContent('Pending'));
});
