import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme';
import api from '../api';
import SeeBookings from './SeeBookings';

const mockNavigate = jest.fn();
let mockSearch = '?view=basic';
jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/bookings', search: mockSearch }),
  useNavigate: () => mockNavigate,
  Link: ({ children }) => <span>{children}</span>,
}), { virtual: true });
jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() } }));
jest.mock('../components/layout/PageScaffold', () => ({ children, stickyHeader }) => <div>{stickyHeader}{children}</div>);
jest.mock('../components/common/AppDrawer', () => ({ children, open }) => open ? <div>{children}</div> : null);
jest.mock('../components/common/FormDrawer', () => () => null);
jest.mock('../components/forms/BookingEditFormRHF', () => () => <div>Edit booking form</div>);
jest.mock('../components/forms/BookingNewFormRHF', () => () => <div>New booking form</div>);
jest.mock('../components/forms/PaymentConfirmForm', () => () => null);
jest.mock('../components/forms/BlockCalFormRHF', () => () => null);
jest.mock('../components/forms/BlockCalEditFormRHF', () => () => null);

const rows = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1, confirmationCode: `BOOK-${i + 1}`, unitId: i < 40 ? 7 : 8,
  unitName: i < 40 ? 'Alpha' : 'Beta', guestName: i % 2 ? 'Ana' : 'John',
  status: i < 30 ? 'Ongoing' : 'Upcoming', source: 'Airbnb',
  checkIn: '2026-11-01', checkOut: '2026-11-04', paymentMethod: 'platform',
}));

beforeEach(() => {
  mockSearch = '?view=basic';
  Element.prototype.scrollIntoView = jest.fn();
  mockNavigate.mockClear();
  api.get.mockClear();
  jest.spyOn(console, 'table').mockImplementation(() => {});
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/bookings' ? rows : [] }));
});
afterEach(() => jest.restoreAllMocks());

function showPage() {
  return render(<ThemeProvider theme={theme}><SeeBookings /></ThemeProvider>);
}

test('basic layout uses toolbar filters and pagination while keeping booking actions', async () => {
  showPage();
  await screen.findByText('Showing 1–25 of 60');
  expect(api.get).toHaveBeenCalledWith('/api/bookings', {
    params: expect.objectContaining({ includeOngoing: 1 }),
  });
  const toolbar = within(screen.getByLabelText('Table controls'));
  expect(toolbar.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  expect(toolbar.queryByRole('button', { name: '+ New Block' })).not.toBeInTheDocument();
  expect(toolbar.queryByRole('textbox', { name: 'Check-out month' })).not.toBeInTheDocument();
  const head = screen.getAllByRole('rowgroup')[0];
  expect(within(head).queryByRole('textbox')).not.toBeInTheDocument();
  expect(within(head).queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByLabelText('Table pagination')).getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('2 / 3')).toBeInTheDocument();
  const unit = toolbar.getByRole('combobox', { name: 'Filter by unit' });
  fireEvent.change(unit, { target: { value: 'Alp' } });
  fireEvent.blur(unit);
  expect(unit).toHaveValue('Alp');
  expect(screen.getByText('Showing 1–25 of 40')).toBeInTheDocument();
  fireEvent.mouseDown(toolbar.getByRole('combobox', { name: 'Filter by status' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Upcoming' }));
  expect(screen.getByText('Showing 1–10 of 10')).toBeInTheDocument();
  fireEvent.change(toolbar.getByRole('textbox', { name: 'Search guest' }), { target: { value: 'JOH' } });
  expect(screen.getByText('Showing 1–5 of 5')).toBeInTheDocument();
  fireEvent.change(toolbar.getByRole('textbox', { name: 'Search guest' }), { target: { value: 'missing' } });
  expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument();
  fireEvent.click(toolbar.getByRole('button', { name: 'Clear Filters' }));
  await screen.findByText('Showing 1–25 of 60');
  expect(toolbar.getByRole('button', { name: 'Clear Filters' })).toBeDisabled();
  fireEvent.click(screen.getByText('BOOK-1'));
  expect(screen.getByText('Edit booking form')).toBeInTheDocument();
  fireEvent.click(toolbar.getByRole('button', { name: '+ New Booking' }));
  expect(screen.getByText('New booking form')).toBeInTheDocument();
  expect(toolbar.queryByRole('button', { name: 'Show full view' })).not.toBeInTheDocument();
});

test('month filter requests exact check-in bounds and preserves focus links', async () => {
  mockSearch = '?view=basic&focus=55';
  showPage();
  await screen.findByText('Edit booking form');
  await screen.findByText('BOOK-55');
  expect(screen.getByText('3 / 3')).toBeInTheDocument();
  const month = screen.getByLabelText('Check-in month');
  fireEvent.change(month, { target: { value: 'February 2024' } });
  fireEvent.blur(month);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/bookings', {
    params: { checkInFrom: '2024-02-01', checkInTo: '2024-02-29', focus: 55 },
  }));
});

test('full view retains its existing controls and header filters', async () => {
  mockSearch = '?view=full';
  api.get.mockResolvedValue({ data: rows.slice(0, 2) });
  showPage();
  await screen.findByText('BOOK-1');
  expect(screen.getByRole('button', { name: '+ New Block' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Check-out month' })).toBeVisible();
  expect(within(screen.getAllByRole('rowgroup')[0]).getAllByRole('textbox').length).toBeGreaterThan(0);
  expect(screen.queryByText('Showing 1–25 of 60')).not.toBeInTheDocument();
});


test('active soft-row display labels, colors and Status filter agree', async () => {
  api.get.mockResolvedValue({ data: [
    { ...rows[0], id: 101, confirmationCode: 'HOLD-ACTIVE', status: 'Active', guest_type: 'Hold', checkIn: '2099-11-01', checkOut: '2099-11-02' },
    { ...rows[0], id: 102, confirmationCode: 'BLOCK-ACTIVE', unitName: 'Beta', status: 'Active', guest_type: 'Block', checkIn: '2099-11-01', checkOut: '2099-11-02' },
    { ...rows[0], id: 103, confirmationCode: 'HOLD-EXPIRED', status: 'Expired', guest_type: 'Hold' },
    { ...rows[0], id: 104, confirmationCode: 'BLOCK-CANCELLED', status: 'Cancelled', guest_type: 'Block' },
    { ...rows[0], id: 105, confirmationCode: 'BLOCK-PAST', status: 'Active', guest_type: 'Block', checkIn: '2000-11-01', checkOut: '2000-11-02' },
  ] });
  showPage();
  await screen.findByText('Showing 1–5 of 5');
  const table = within(screen.getByRole('table'));
  expect(table.getByText('Hold')).toHaveStyle({ color: theme.hausin.colors.holdAmber });
  expect(table.getByText('Block', { exact: true })).toHaveStyle({ color: theme.hausin.colors.blockGrey });
  expect(table.getByText('Expired')).toBeVisible();
  expect(table.getByText('Cancelled')).toBeVisible();
  expect(table.getByText('Past')).toBeVisible();
  expect(table.queryByText('Active')).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Filter by status' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Block / Hold', exact: true }));
  expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
  expect(screen.getByText('BLOCK-ACTIVE')).toBeInTheDocument();
  expect(screen.getByText('HOLD-ACTIVE')).toBeInTheDocument();
  expect(screen.queryByText('HOLD-EXPIRED')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by unit' }), { target: { value: 'Beta' } });
  expect(screen.getByText('Showing 1–1 of 1')).toBeInTheDocument();
  expect(screen.getByText('BLOCK-ACTIVE')).toBeInTheDocument();
  expect(screen.queryByText('HOLD-ACTIVE')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by unit' }), { target: { value: '' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Filter by status' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Past / Expired', exact: true }));
  expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
  expect(screen.getByText('BLOCK-PAST')).toBeInTheDocument();
  expect(screen.getByText('HOLD-EXPIRED')).toBeInTheDocument();
  expect(screen.queryByText('BLOCK-CANCELLED')).not.toBeInTheDocument();
  expect(screen.queryByText('HOLD-ACTIVE')).not.toBeInTheDocument();
});


test('Status dropdown always lists the requested order and shares table status colors', async () => {
  api.get.mockResolvedValue({ data: rows.slice(0, 1) });
  showPage();
  await screen.findByText('Showing 1–1 of 1');
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Filter by status' }));
  const options = await screen.findAllByRole('option');
  expect(options.map((option) => option.textContent)).toEqual([
    'All statuses', 'Ongoing', 'Upcoming', 'Block / Hold', 'Past / Expired', 'Cancelled',
  ]);
  for (const status of ['Ongoing', 'Upcoming', 'Cancelled']) {
    expect(within(screen.getByRole('option', { name: status, exact: true })).getByText(status))
      .toHaveClass('status-pill', status.toLowerCase());
  }
  for (const status of ['Past', 'Expired']) {
    expect(within(screen.getByRole('option', { name: 'Past / Expired', exact: true })).getByText(status))
      .toHaveClass('status-pill', status.toLowerCase());
  }
  expect(within(screen.getByRole('option', { name: 'Block / Hold', exact: true })).getByText('Hold'))
    .toHaveStyle({ color: theme.hausin.colors.holdAmber });
  expect(within(screen.getByRole('option', { name: 'Block / Hold', exact: true })).getByText('Block'))
    .toHaveStyle({ color: theme.hausin.colors.blockGrey });
  fireEvent.click(screen.getByRole('option', { name: 'Block / Hold', exact: true }));
  expect(within(screen.getByRole('combobox', { name: 'Filter by status' })).getByText('Hold'))
    .toHaveStyle({ color: theme.hausin.colors.holdAmber });
});
