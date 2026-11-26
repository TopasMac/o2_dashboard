import { randomUUID } from 'crypto';
import React from 'react';
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';

import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme';
import api from '../api';

const render = (ui) => rtlRender(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
import ServiceJobs from './ServiceJobs';

jest.mock('../components/layout/AppShell', () => ({ children }) => <div>{children}</div>);
jest.mock('../components/layout/SectionHeader', () => () => null);
jest.mock('../api', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() }));

test('shows jobs newest scheduled date first, with newer IDs first on the same date', async () => {
  const job = {
    unit: { id: 1, name: 'Test unit' }, category: { id: 2, name: 'Mantenimiento' },
    status: 'pending', bill_to: 'CLIENT',
  };
  const jobs = [
    { ...job, id: 1, scheduledDate: '2020-02-01', description: 'Oldest job' },
    { ...job, id: 2, scheduledDate: '2020-02-20', description: 'Later job' },
    { ...job, id: 3, scheduledDate: '2020-02-20', description: 'Newest job' },
  ];
  api.get.mockImplementation(async (url) => ({ data: {
    '/api/service-jobs': { jobs },
    '/api/service-jobs/options': { units: [], categories: [] },
    '/api/service-providers': { providers: [] },
  }[url] }));
  const originalUrl = window.location.href;
  window.history.replaceState(null, '', '/service-jobs?job=1');
  try {
    render(<ServiceJobs />);
    await screen.findByText('Newest job');
    const rows = screen.getAllByRole('row').filter((row) => /Oldest job|Later job|Newest job/.test(row.textContent));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Newest job');
    expect(rows[1]).toHaveTextContent('Later job');
    expect(rows[2]).toHaveTextContent('Oldest job');
  } finally {
    window.history.replaceState(null, '', originalUrl);
  }
});

test('paginates newest jobs and resets the page when toolbar filters change', async () => {
  const jobs = Array.from({ length: 27 }, (_, index) => ({
    id: index + 1, scheduledDate: '2020-02-20', description: `Task ${index + 1}`,
    unit: index === 0 ? { id: 2, name: 'Historical unit' } : { id: 1, name: 'Test unit' }, category: { id: 2, name: 'Mantenimiento' },
    status: index === 0 ? 'done' : 'pending', bill_to: 'CLIENT',
  }));
  api.get.mockImplementation(async (url) => ({ data: {
    '/api/service-jobs': { jobs },
    '/api/service-jobs/options': { units: [], categories: [] },
    '/api/service-providers': { providers: [] },
  }[url] }));
  const originalUrl = window.location.href;
  window.history.replaceState(null, '', '/service-jobs?job=27');
  try {
    render(<ServiceJobs />);
    await screen.findByText('Task 27');
    expect(screen.getByRole('heading', { name: 'Service Jobs' })).toBeInTheDocument();
    expect(screen.getByText('Showing 1–25 of 27')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    const filters = within(screen.getByRole('group', { name: 'Table filters' }));
    fireEvent.mouseDown(filters.getByRole('combobox', { name: 'Status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Pending' }));
    expect(screen.getByText('Showing 1–25 of 26')).toBeInTheDocument();
    expect(screen.getByText('Task 27')).toBeInTheDocument();
    expect(screen.queryByText('Task 1')).not.toBeInTheDocument();
    const unitInput = filters.getByRole('combobox', { name: 'Unit' });
    expect(screen.getAllByRole('combobox', { name: 'Unit' })).toHaveLength(1);
    expect(screen.queryByRole('combobox', { name: 'Provider' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Description' })).not.toBeInTheDocument();
    fireEvent.change(unitInput, { target: { value: 'Historical' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Historical unit' }));
    expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument();
    fireEvent.mouseDown(filters.getByRole('combobox', { name: 'Status' }));
    fireEvent.click(screen.getByRole('option', { name: 'All' }));
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–1 of 1')).toBeInTheDocument();
    fireEvent.click(filters.getByRole('button', { name: 'Clear Filters' }));
    expect(screen.getByText('Showing 1–25 of 27')).toBeInTheDocument();
    expect(filters.getByRole('button', { name: 'Clear Filters' })).toBeDisabled();
  } finally {
    window.history.replaceState(null, '', originalUrl);
  }
});

test('opens the linked job month and scrolls to its row', async () => {
  const job = {
    id: 42, unit: { id: 1, name: 'Test unit' }, category: { id: 2, name: 'Mantenimiento' },
    scheduledDate: '2020-02-01', description: 'Repair pump', status: 'pending',
  };
  api.get.mockImplementation(async (url) => ({ data: {
    '/api/service-jobs': { jobs: [job] },
    '/api/service-jobs/options': { units: [], categories: [] },
    '/api/service-providers': { providers: [] },
  }[url] }));

  const originalUrl = window.location.href;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const scrollIntoView = jest.fn(function () { return this; });
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  window.history.replaceState(null, '', '/service-jobs?job=42');
  try {
    render(<ServiceJobs />);
    const row = await screen.findByRole('row', { name: /Repair pump/ });
    await waitFor(() => expect(scrollIntoView).toHaveReturnedWith(row));
  } finally {
    window.history.replaceState(null, '', originalUrl);
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test('schedules an unassigned job, then edits it to assign a provider and complete it', async () => {
  const unit = { id: 1, name: 'IT_001' };
  const category = { id: 2, name: 'Mantenimiento' };
  const provider = { id: 3, name: 'Test Plumber' };
  const pending = {
    id: 4, unit, category, provider: null, status: 'pending', bill_to: 'CLIENT',
    description: 'Clean pipes', scheduledDate: '2026-11-12', notes: null,
  };
  api.get.mockImplementation(async (url) => ({ data: {
    '/api/service-jobs': { jobs: [] },
    '/api/service-jobs/options': { units: [unit], categories: [category] },
    '/api/service-providers': { providers: [provider] },
  }[url] }));
  api.post.mockResolvedValue({ data: { job: pending } });
  api.patch.mockResolvedValue({ data: { job: { ...pending, provider, status: 'done', bill_to: 'OWNERS2' } } });

  render(<ServiceJobs />);
  await screen.findByText('No service jobs scheduled.');
  fireEvent.click(screen.getByTitle('Clear month filter'));
  fireEvent.click(screen.getByRole('button', { name: '+ Add Service' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText(/Scheduled Date/), { target: { value: pending.scheduledDate } });
  fireEvent.change(dialog.getByRole('textbox', { name: /Description/ }), { target: { value: pending.description } });

  const select = (label, option) => {
    fireEvent.mouseDown(within(screen.getByRole('dialog')).getByRole('combobox', { name: label }));
    fireEvent.click(screen.getByRole('option', { name: option }));
  };
  fireEvent.change(dialog.getByRole('combobox', { name: /Unit/ }), { target: { value: 'IT_' } });
  fireEvent.click(screen.getByRole('option', { name: unit.name }));
  select(/Category/, category.name);
  fireEvent.click(dialog.getByRole('button', { name: 'Save' }));

  const edit = await screen.findByRole('button', { name: 'HKSJ00004' });
  expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: /12-11-2026 HKSJ00004/ })).toContainElement(edit);
  expect(api.post).toHaveBeenCalledWith('/api/service-jobs', expect.objectContaining({
    unitId: unit.id, categoryId: category.id, providerId: null, status: 'pending', bill_to: 'CLIENT',
  }));
  expect(screen.getByRole('cell', { name: 'Unassigned' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(edit);
  fireEvent.change(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Assigned Provider' }), {
    target: { value: 'Plumb' },
  });
  fireEvent.click(screen.getByRole('option', { name: provider.name }));
  select(/Bill To/, 'Owners2');
  select('Status', 'Done');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('combobox', { name: 'Status for HKSJ00004' }, { timeout: 3000 })).toHaveTextContent('Done');
  expect(screen.getByRole('cell', { name: provider.name })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Clean pipes Mantenimiento * Owners2' })).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Pending' }));
  expect(screen.queryByRole('combobox', { name: 'Status for HKSJ00004' })).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Done' }));
  expect(screen.getByRole('combobox', { name: 'Status for HKSJ00004' })).toHaveTextContent('Done');
  expect(api.patch).toHaveBeenCalledWith('/api/service-jobs/4', expect.objectContaining({
    providerId: provider.id, status: 'done', bill_to: 'OWNERS2',
  }));

  const rowStatus = screen.getByRole('combobox', { name: 'Status for HKSJ00004' });
  api.patch.mockResolvedValueOnce({ data: { job: { ...pending, provider, status: 'cancelled', bill_to: 'OWNERS2' } } });
  fireEvent.mouseDown(rowStatus);
  fireEvent.click(screen.getByRole('option', { name: 'Cancelled' }));
  await waitFor(() => expect(rowStatus).not.toBeInTheDocument());
  expect(api.patch).toHaveBeenLastCalledWith('/api/service-jobs/4', { status: 'cancelled' });
});


beforeAll(() => {
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID } });
});

test('allocates and reopens Labour and Equipment through the HK form', async () => {
  URL.createObjectURL = jest.fn(() => 'blob:attachment-preview');
  URL.revokeObjectURL = jest.fn();
  const unit = { id: 1, name: 'IT_001', city: 'Tulum' };
  const category = { id: 2, name: 'Mantenimiento', type: 'Gasto' };
  const equipmentCategory = { id: 3, name: 'Equipamiento', type: 'Gasto' };
  const job = {
    id: 4, unit, category, status: 'done', bill_to: 'OWNERS2', description: 'Clean pipes',
    scheduledDate: '2026-11-12', allocations: [],
  };
  api.get.mockImplementation(async (url) => ({ data: {
    '/api/service-jobs': { jobs: [job] },
    '/api/service-jobs/options': { units: [unit], categories: [category], allocationCategories: [category, equipmentCategory] },
    '/api/service-providers': { providers: [] },
  }[url] }));
  api.put.mockImplementation(async (url, values) => {
    const lineType = values.categoryId === category.id ? 'labour' : 'equipment';
    return { data: { allocation: { ...values, lineType, id: lineType === 'labour' ? 7 : 8, transactionCode: 'HK-' + lineType } } };
  });
  render(<LocalizationProvider dateAdapter={AdapterDayjs}><ServiceJobs /></LocalizationProvider>);
  await screen.findByRole('columnheader', { name: 'Allocation' });
  fireEvent.click(screen.getByTitle('Clear month filter'));
  fireEvent.click(await screen.findByRole('button', { name: 'Add' }));
  let dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByRole('combobox', { name: 'Unit' })).toHaveValue('IT_001');
  expect(dialog.getByRole('combobox', { name: 'Charge to' })).toHaveTextContent('Owners2');
  expect(dialog.getByRole('textbox', { name: 'Description' })).toHaveValue('Clean pipes');
  fireEvent.change(dialog.getByRole('textbox', { name: 'Paid' }), { target: { value: '100' } });
  const receipt = new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' });
  const photo = new File(['photo'], 'photo.png', { type: 'image/png' });
  fireEvent.change(document.querySelector('input[name=doc1]'), { target: { files: [receipt] } });
  fireEvent.click(dialog.getByRole('button', { name: 'Preview receipt.pdf' }));
  const preview = within(screen.getByRole('dialog', { name: 'receipt.pdf' }));
  expect(preview.getByTitle('receipt.pdf')).toHaveAttribute('src', 'blob:attachment-preview');
  fireEvent.click(preview.getByRole('button', { name: 'Close preview' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'receipt.pdf' })).not.toBeInTheDocument());
  fireEvent.click(dialog.getByRole('button', { name: 'Remove receipt.pdf' }));
  expect(dialog.queryByText('receipt.pdf')).not.toBeInTheDocument();
  fireEvent.change(document.querySelector('input[name=doc1]'), { target: { files: [receipt] } });
  fireEvent.change(document.querySelector('input[name=doc2]'), { target: { files: [photo] } });
  fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
  await screen.findByRole('button', { name: 'Labour · HK-labour' });
  expect(api.put).toHaveBeenLastCalledWith('/api/service-jobs/4/allocations', expect.objectContaining({
    unitId: 1, categoryId: 2, date: '2026-11-12', allocationTarget: 'Owners2', paid: 100, charged: 100,
  }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('cell', { name: 'Allocated' })).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Done' }));
  expect(screen.queryByRole('cell', { name: 'Allocated' })).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Allocated' }));
  const allocatedLabour = screen.getByRole('button', { name: 'Labour · HK-labour' });
  const uploads = api.post.mock.calls.filter(([url]) => url === '/api/hk-transactions/7/documents/upload');
  expect(uploads.map(([, body]) => body.get('file').name)).toEqual(['receipt.pdf', 'photo.png']);
  fireEvent.click(allocatedLabour);
  dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByText('Edit - IT_001 * Clean pipes')).toBeInTheDocument();
  expect(document.querySelector('input[name=doc1]')).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  dialog = within(screen.getByRole('dialog'));
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Category' }));
  fireEvent.click(screen.getByRole('option', { name: 'Equipamiento' }));
  fireEvent.change(dialog.getByRole('textbox', { name: 'Paid' }), { target: { value: '25' } });
  fireEvent.change(dialog.getByRole('textbox', { name: 'Charged' }), { target: { value: '30' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('button', { name: 'Equipment · HK-equipment' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Labour · HK-labour' })).toBeInTheDocument();
  expect(api.put).toHaveBeenLastCalledWith('/api/service-jobs/4/allocations', expect.objectContaining({ categoryId: 3 }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Equipment · HK-equipment' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
  const confirmation = within(screen.getByRole('dialog', { name: 'Delete allocation?' }));
  expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(confirmation.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Equipment · HK-equipment' })).not.toBeInTheDocument());
  expect(api.delete).toHaveBeenCalledWith('/api/service-jobs/4/allocations/8');
}, 15000);
