import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import api from '../api';
import ServiceJobs from './ServiceJobs';

jest.mock('../components/layout/AppShell', () => ({ children }) => <div>{children}</div>);
jest.mock('../components/layout/SectionHeader', () => () => null);
jest.mock('../api', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));

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

  expect(await screen.findByRole('combobox', { name: 'Status for HKSJ00004' })).toHaveTextContent('Done');
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
