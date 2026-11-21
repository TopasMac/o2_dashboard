import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../api';
import DashboardAlertCenterCard from './DashboardAlertCenterCard';

jest.mock('../../api', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));
jest.mock('../../hooks/useAlerts', () => () => ({ alerts: [], loading: false }));
jest.mock('./AlertCenter', () => () => null);

const queueUrl = '/api/dashboard/airbnb-review-queue';

beforeEach(() => {
  jest.resetAllMocks();
});

test('keeps the review tab out of the default alerts card', () => {
  render(<DashboardAlertCenterCard />);

  expect(screen.queryByRole('button', { name: /Reseñas Airbnb/ })).toBeNull();
  expect(api.get).not.toHaveBeenCalled();
});

test.each([
  ['Marcar completada', 'made'],
  ['Omitir', 'skipped'],
])('saves the selected review action when the Admin clicks %s', async (label, status) => {
  const booking = {
    bookingId: 123,
    currentStatus: 'pending',
    guestName: 'Alex Guest',
    checkoutDate: '2026-11-04',
    reviewDeadline: '2026-11-16',
    reservationUrl: 'https://www.airbnb.com/hosting/reservations/details/TEST',
  };
  api.get
    .mockResolvedValueOnce({ data: { items: [booking] } })
    .mockResolvedValueOnce({ data: [] })
    .mockResolvedValueOnce({ data: { items: [{ ...booking, currentStatus: status }] } });
  api.post.mockResolvedValue({});

  render(<DashboardAlertCenterCard showAirbnbReviews />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reseñas Airbnb (1)' }));

  const reviewLink = await screen.findByRole('link', { name: 'Escribir reseña' });
  const messageLink = screen.getByRole('link', { name: 'Enviar mensaje' });
  expect(reviewLink.getAttribute('href')).toBe(booking.reservationUrl);
  expect(messageLink.getAttribute('href')).toBe(booking.reservationUrl);
  expect(screen.queryByText(/Total Mes/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: label }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/review_actions', {
    reservationId: 123,
    status,
    source: 'Airbnb',
    unitId: null,
    unitName: null,
    checkoutDate: '2026-11-04',
  }));
  await screen.findByText('No hay reservas con checkout recientes.');
  await screen.findByRole('button', { name: 'Reseñas Airbnb (0)' });
  expect(api.get).toHaveBeenLastCalledWith(queueUrl);
});

test('copies distinct Airbnb drafts without recording completion', async () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  api.get.mockResolvedValue({ data: { items: [{
    bookingId: 123,
    currentStatus: 'pending',
    guestName: 'Alex Guest',
    checkoutDate: '2026-11-04',
    reservationUrl: 'https://www.airbnb.com/hosting/reservations/details/TEST',
  }] } });

  try {
    render(<DashboardAlertCenterCard showAirbnbReviews />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reseñas Airbnb (1)' }));
    const reviewLink = await screen.findByRole('link', { name: 'Escribir reseña' });
    const messageLink = screen.getByRole('link', { name: 'Enviar mensaje' });
    fireEvent.click(reviewLink);
    await waitFor(() => expect(reviewLink.title).toMatch(/Texto copiado/));
    expect(messageLink.title).toBe('');

    fireEvent.click(messageLink);
    await waitFor(() => expect(messageLink.title).toMatch(/Texto copiado/));
    fireEvent.click(reviewLink);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3));

    const [[review], [message]] = writeText.mock.calls;
    expect(review).toContain('It was a pleasure to welcome Alex.');
    expect(message).toContain('Hello Alex!');
    expect(message).toContain(`"${review}"`);
    expect(message).toContain("In case you haven't left us a review yet");
    expect(message).toMatch(/Best regards,\nAntonio Pedro\nHausIn$/);
    expect(api.post).not.toHaveBeenCalled();
  } finally {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete navigator.clipboard;
    }
  }
});

test('flags a missing Airbnb URL and offers copy-only actions', async () => {
  api.get.mockResolvedValue({ data: { items: [{
    bookingId: 123,
    currentStatus: 'pending',
    guestName: 'Alex Guest',
    checkoutDate: '2026-11-04',
    reservationUrl: null,
  }] } });

  render(<DashboardAlertCenterCard showAirbnbReviews />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reseñas Airbnb (1)' }));

  expect(screen.getByText('Sin enlace de Airbnb')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Copiar reseña' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Copiar mensaje' })).toBeTruthy();
});
