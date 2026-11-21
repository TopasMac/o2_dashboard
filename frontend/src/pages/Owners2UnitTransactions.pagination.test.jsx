import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme';
import api from '../api';
import Owners2UnitTransactions from './Owners2UnitTransactions';

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ search: '' }), useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn() }, BACKEND_BASE: '' }));
jest.mock('../components/layout/PageScaffold', () => ({ children, stickyHeader }) => <div>{stickyHeader}{children}</div>);
jest.mock('../components/common/AppDrawer', () => ({ children, open }) => open ? <div>{children}</div> : null);
jest.mock('../components/forms/UnitTransactionEditFormRHF', () => () => <div>Edit transaction form</div>);
jest.mock('../components/forms/UnitTransactionNewFormRHF', () => () => <div>New transaction form</div>);
jest.mock('../components/common/DocumentPreview', () => () => <div>Document preview</div>);

test('real transaction toolbar filters before pagination, clears and preserves row actions', async () => {
  api.get.mockResolvedValue({ data: Array.from({ length: 729 }, (_, i) => ({
    id: i + 1, transaction_code: `TX-${i + 1}`, date: '2026-11-01', unitName: i < 50 ? 'Alpha' : 'Beta',
    category_name: i % 2 ? 'Labour' : 'Equipment', description: `Work ${i + 1}`, amount: 20,
  })) });
  render(<ThemeProvider theme={theme}><Owners2UnitTransactions /></ThemeProvider>);
  await screen.findByText('Showing 1–25 of 729');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('2 / 30')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by unit' }), { target: { value: 'Alpha' } });
  fireEvent.blur(screen.getByRole('combobox', { name: 'Filter by unit' }));
  expect(screen.getByRole('combobox', { name: 'Filter by unit' })).toHaveValue('Alpha');
  expect(screen.getByText('Showing 1–25 of 50')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByRole('combobox', { name: 'Filter by unit' })).toHaveValue('Alpha');
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by type' }), { target: { value: 'Lab' } });
  fireEvent.blur(screen.getByRole('combobox', { name: 'Filter by type' }));
  expect(screen.getByRole('combobox', { name: 'Filter by type' })).toHaveValue('Lab');
  expect(screen.getByText('Showing 1–25 of 25')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search description' }), { target: { value: 'no match' } });
  expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
  expect(screen.getByText('Showing 1–25 of 729')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Clear Filters' })).toBeDisabled();
  fireEvent.click(screen.getByText('TX-1'));
  await waitFor(() => expect(screen.getByText('Edit transaction form')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '+ New Transaction' }));
  expect(screen.getByText('New transaction form')).toBeInTheDocument();
});
