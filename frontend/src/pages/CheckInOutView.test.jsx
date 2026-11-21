import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import api from '../api';
import CheckInOutView from './CheckInOutView';

jest.mock('../api', () => ({ get: jest.fn() }));
jest.mock('../components/layout/AppShell', () => ({ children }) => children);

test('shows a scheduled service job on a day without arrivals or departures', async () => {
  api.get.mockImplementation(async (path) => ({
    data: path === '/api/bookings/check-activity' ? [] : {
      jobs: [{
        id: 42, city: 'Tulum', scheduledDate: '2026-11-14', unitName: 'Test unit',
        categoryId: 8, status: 'done', description: 'Clean sofa',
        notes: 'Use the side entrance', providerName: 'Test provider',
      }],
    },
  }));

  render(<CheckInOutView showServiceJobs />);
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-14' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show' }));

  const status = await screen.findByRole('link', { name: /Done.*Test unit/ });
  expect(status).toHaveAttribute('href', '/service-jobs?job=42');
  expect(screen.getByText('Clean sofa')).toBeVisible();
  expect(screen.getByText(/Use the side entrance/)).toBeVisible();
  expect(screen.getByText(/Test provider/)).toBeVisible();
});
