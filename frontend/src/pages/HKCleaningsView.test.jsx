import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import HKCleaningsView from './HKCleaningsView';
import api from '../api';

jest.mock('../api', () => ({ get: jest.fn() }));
jest.mock('../components/layout/PageScaffold', () => ({ children, stickyHeader }) => <div>{stickyHeader}{children}</div>);
jest.mock('../components/common/AppDrawer', () => () => null);
jest.mock('../components/forms/HKCleaningsEditFormRHF', () => () => null);
jest.mock('../components/forms/HKCleaningsNewFormRHF', () => () => null);
jest.mock('../components/forms/HKCleaningsTablePage/HKCleaningsRateForm', () => () => null);
jest.mock('../components/layout/components/YearMonthPicker', () => () => <span>Month picker</span>);

test('keeps cancelled cleanings visible and filters them despite their retained Reported state', async () => {
  api.get.mockImplementation(async (url) => ({ data: { ok: true, data: url === '/api/hk-cleanings' ? [
    { id: 42, unit_name: 'Cancelled Unit', unit_city: 'Tulum', checkout_date: '2026-11-23', status: 'cancelled', report_status: 'reported' },
    { id: 43, unit_name: 'Active Unit', unit_city: 'Tulum', checkout_date: '2026-11-23', status: 'done', report_status: 'reported' },
  ] : [] } }));
  render(<HKCleaningsView />);
  const row = (await screen.findByText('Cancelled Unit')).closest('tr');
  expect(within(row).getByText('Cancelled')).toHaveStyle({ color: '#D9534F' });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
  expect(screen.getAllByRole('option').at(-1)).toHaveTextContent('Cancelled');
  fireEvent.click(screen.getByRole('option', { name: 'Cancelled' }));
  expect(screen.getByText('Cancelled Unit')).toBeInTheDocument();
  expect(screen.queryByText('Active Unit')).not.toBeInTheDocument();
});
