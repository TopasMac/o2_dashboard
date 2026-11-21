import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../../theme';
import TableLite from './TableLite';
import TablePaginationFooter from './TablePaginationFooter';

jest.mock('../common/DocumentPreview', () => () => null);
const rows = Array.from({ length: 729 }, (_, i) => ({
  id: i + 1, code: `TX-${i + 1}`, unit: i < 50 ? 'Alpha' : 'Beta',
  category: i % 2 ? 'Labour' : 'Equipment', description: `Description ${i + 1}`,
}));
const columns = [
  { header: 'Code', accessor: 'code', cell: (row) => <a href={`/transaction/${row.id}`}>{row.code}</a> },
  { header: 'Unit', accessor: 'unit', filter: { type: 'autocomplete' } },
  { header: 'Type', accessor: 'category', filter: { type: 'autocomplete' } },
  { header: 'Description', accessor: 'description', filter: { type: 'text' } },
];
const view = (props = {}) => <ThemeProvider theme={theme}><TableLite columns={columns} rows={rows}
  clientPagination visualVariant="hausin" enableFilters showHeaderFilters={false} {...props} /></ThemeProvider>;
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

test('all 729 rows remain accessible, with fixed pages, final range, links and external footer', () => {
  render(view());
  const seen = [];
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  for (let page = 0; page < 30; page++) {
    const links = within(screen.getByRole('table')).getAllByRole('link');
    expect(links).toHaveLength(page === 29 ? 4 : 25);
    seen.push(...links.map((link) => link.textContent));
    if (page < 29) fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  }
  expect(new Set(seen).size).toBe(729);
  expect(screen.getByText('Showing 726–729 of 729')).toBeInTheDocument();
  expect(screen.getByText('30 / 30')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  expect(screen.getByRole('link', { name: 'TX-729' })).toHaveAttribute('href', '/transaction/729');
  const scroll = screen.getByTestId('table-scroll-container');
  expect(scroll).not.toContainElement(screen.getByRole('navigation', { name: 'Table pagination' }));
  scroll.scrollTop = 500;
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  expect(scroll.scrollTop).toBe(0);
  expect(screen.getByText('29 / 30')).toBeInTheDocument();
});

test('filters use matching totals, reset page, retain selections and combine with AND', () => {
  const { rerender } = render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  rerender(view({ filterValues: { unit: 'Alpha' }, onFilterChange: jest.fn() }));
  expect(screen.getByText('Showing 1–25 of 50')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('Showing 26–50 of 50')).toBeInTheDocument();
  expect(bodyRows()).toHaveLength(25);
  rerender(view({ filterValues: { unit: 'Alpha', category: 'Lab', description: 'Description' }, onFilterChange: jest.fn() }));
  expect(screen.getByText('Showing 1–25 of 25')).toBeInTheDocument();
  rerender(view({ filterValues: {}, onFilterChange: jest.fn() }));
  expect(screen.getByText('Showing 1–25 of 729')).toBeInTheDocument();
});

test('sort reset, dataset shrink, subsequent growth and empty results stay valid', () => {
  const { rerender } = render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  rerender(view({ rows: [...rows].reverse(), paginationResetKey: 'date-asc' }));
  expect(screen.getByText('1 / 30')).toBeInTheDocument();
  expect(screen.getAllByRole('link')[0]).toHaveTextContent('TX-729');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  rerender(view({ rows: rows.slice(0, 4), paginationResetKey: 'date-asc' }));
  expect(screen.getByText('Showing 1–4 of 4')).toBeInTheDocument();
  rerender(view({ paginationResetKey: 'date-asc' }));
  expect(screen.getByText('1 / 30')).toBeInTheDocument();
  rerender(view({ rows: [] }));
  expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument();
  expect(screen.getByText('0 / 0')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
});

test('highlight opens the matching page without locking navigation; legacy tables remain unpaged', () => {
  const { rerender } = render(view());
  fireEvent(window, new CustomEvent('datatable:highlight', { detail: { id: 729 } }));
  expect(screen.getByRole('link', { name: 'TX-729' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  expect(screen.getByText('29 / 30')).toBeInTheDocument();
  rerender(view({ filterValues: { unit: 'Beta' }, onFilterChange: jest.fn() }));
  expect(screen.getByText('Showing 1–25 of 679')).toBeInTheDocument();
  rerender(view({ clientPagination: false }));
  expect(screen.getAllByRole('link')).toHaveLength(729);
});

test('footer accepts server metadata without receiving the dataset', () => {
  const onPageChange = jest.fn();
  render(<ThemeProvider theme={theme}><TablePaginationFooter page={29} pageSize={25} total={729} totalPages={30} onPageChange={onPageChange} /></ThemeProvider>);
  expect(screen.getByText('Showing 726–729 of 729')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  expect(onPageChange).toHaveBeenCalledWith(28);
});
