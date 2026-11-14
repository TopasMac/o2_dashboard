/* eslint-disable testing-library/no-node-access -- jsdom requires direct access to open the native disclosure. */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import api from '../../api';
import ActivityCard from './ActivityCard';

jest.mock('../../api', () => ({ get: jest.fn() }));

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
