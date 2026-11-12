import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../api';
import ServiceProviders from './ServiceProviders';

jest.mock('../components/layout/AppShell', () => ({ children }) => <div>{children}</div>);
jest.mock('../components/layout/SectionHeader', () => () => null);

jest.mock('../api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
}));

const provider = {
  id: 7,
  provider_id: 'SP000007',
  name: 'Synthetic Plumber',
  occupation: 'Plumber',
  area: 'Both',
  account_holder: 'Synthetic Account',
  bank_name: 'BBVA',
  account_number_last_four: '4234',
  notes: 'Synthetic directory note',
  created_at: '2026-11-11',
  is_active: true,
};

const directory = (providers) => ({ data: { ok: true, providers } });

beforeEach(() => jest.resetAllMocks());

test('renders records returned by the directory API in the real table', async () => {
  api.get.mockResolvedValue(directory([provider]));
  render(<ServiceProviders />);

  expect(await screen.findByText(provider.name)).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: /Both/ })).toContainElement(
    screen.getByRole('button', { name: `Edit ${provider.name}` }),
  );
  expect(screen.queryByRole('columnheader', { name: 'Area' })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Occupation' })).toBeInTheDocument();
  expect(screen.queryByText(provider.provider_id)).not.toBeInTheDocument();
  expect(screen.getByText('Synthetic Account')).toBeInTheDocument();
  expect(screen.getByText('BBVA · *...4234')).toBeInTheDocument();
  expect(screen.getByText(provider.notes)).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Date Started' })).toBeInTheDocument();
  expect(screen.getByText('11-11-2026')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: `Edit ${provider.name}` })).toBeInTheDocument();
});

test('filters by provider name and clears the inline filter', async () => {
  api.get.mockResolvedValue(directory([provider]));
  render(<ServiceProviders />);
  await screen.findByText(provider.name);

  const nameFilter = screen.getByPlaceholderText('Provider');
  fireEvent.change(nameFilter, { target: { value: 'No match' } });
  expect(screen.queryByText(provider.name)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
  expect(screen.getByText(provider.name)).toBeInTheDocument();
  expect(nameFilter).toHaveValue('');
});

test('distinguishes an empty result from an unexpected response', async () => {
  api.get.mockResolvedValueOnce(directory([])).mockResolvedValueOnce({ data: '<html></html>' });
  render(<ServiceProviders />);

  const empty = 'No service providers match the current filters.';
  expect(await screen.findByText(empty)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('Could not load service providers. Try refreshing.')).toBeInTheDocument();
  expect(screen.queryByText(empty)).not.toBeInTheDocument();
});

test('creates a provider with blank payment fields and deactivates through a partial update', async () => {
  api.get.mockResolvedValue(directory([provider]));
  api.post.mockResolvedValue({ data: { ok: true } });
  api.patch.mockResolvedValue({ data: { ok: true } });
  render(<ServiceProviders />);
  await screen.findByText(provider.name);

  fireEvent.click(screen.getByRole('button', { name: /Add Provider/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Another Provider' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(api.post).toHaveBeenCalledWith('/api/service-providers', expect.objectContaining({
    name: 'Another Provider',
  }));
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('bankType');

  const edit = await screen.findByRole('button', { name: `Edit ${provider.name}` });
  api.get.mockResolvedValueOnce({ data: { ok: true, provider } });
  fireEvent.click(edit);
  const deactivate = await screen.findByRole('button', { name: 'Deactivate' });
  fireEvent.click(deactivate);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
  expect(api.patch).toHaveBeenCalledWith('/api/service-providers/7', { isActive: false });
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(4));
});

test('requires complete bank details and submits a switch from Card to CLABE', async () => {
  api.get.mockResolvedValueOnce(directory([provider])).mockResolvedValueOnce({
    data: {
      ok: true,
      provider: {
        ...provider,
        bank_name: 'BBVA',
        account_holder: 'Synthetic Account',
        account_number: '0012344234',
      },
    },
  }).mockResolvedValue(directory([provider]));
  api.patch.mockResolvedValue({ data: { ok: true } });
  render(<ServiceProviders />);

  fireEvent.click(await screen.findByRole('button', { name: `Edit ${provider.name}` }));
  const bankDetails = await screen.findByRole('button', { name: 'Bank Details' });
  expect(bankDetails).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(bankDetails);
  const number = await screen.findByRole('textbox', { name: 'Number' });
  expect(number).toHaveValue('0012344234');

  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Type' }));
  fireEvent.click(await screen.findByRole('option', { name: 'CLABE' }));
  expect(number).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter an account holder');
  expect(api.patch).not.toHaveBeenCalled();

  fireEvent.change(number, { target: { value: '0123 4567 8901 2345 67' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(api.patch).toHaveBeenCalledWith('/api/service-providers/7', expect.objectContaining({
    bankName: 'BBVA',
    accountHolder: 'Synthetic Account',
    bankType: 'CLABE',
    bankNumber: '012345678901234567',
  }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
});

test('hides the copy button when the provider has no bank details', async () => {
  const withoutBank = {
    ...provider,
    account_holder: null,
    bank_name: null,
    account_number_last_four: null,
  };
  api.get.mockResolvedValue(directory([withoutBank]));
  render(<ServiceProviders />);

  expect(await screen.findByText(provider.name)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Copy bank details/ })).not.toBeInTheDocument();
});

test.each([
  ['Tarjeta', '0012-3456 7891 0', '999999999999999999'],
  ['CLABE', null, '0012-3456 7891 0'],
])('copies the saved %s on demand in groups of four digits', async (label, card, clabe) => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    api.get.mockResolvedValueOnce(directory([provider])).mockResolvedValueOnce({
      data: {
        ok: true,
        provider: {
          ...provider,
          account_number: card,
          clabe,
        },
      },
    });
    render(<ServiceProviders />);

    const copy = await screen.findByRole('button', { name: `Copy bank details for ${provider.name}` });
    expect(api.get).toHaveBeenCalledTimes(1);
    fireEvent.click(copy);
    expect(await screen.findByText('Bank details copied.')).toBeInTheDocument();
    expect(api.get).toHaveBeenLastCalledWith('/api/service-providers/7');
    expect(writeText).toHaveBeenCalledWith(`Nombre: Synthetic Account\nBanco: BBVA\n${label}: 0012 3456 7891 0`);
  } finally {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete navigator.clipboard;
    }
  }
});
