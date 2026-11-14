import { fireEvent, render, screen } from '@testing-library/react';
import api from './api';
import App from './App';

// CRA's Jest resolver predates React Router's package exports. Use the
// installed router's CommonJS entry so navigation still uses real router state.
jest.mock('react-router-dom', () => {
  const { TextEncoder, TextDecoder } = require('util');
  Object.assign(globalThis, { TextEncoder, TextDecoder });
  return jest.requireActual('../node_modules/react-router');
}, { virtual: true });
jest.mock('./api', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('./hooks/useAlerts', () => () => ({ alerts: [], loading: false }));
jest.mock('./pages/Dashboard', () => {
  const DashboardAlertCenterCard =
    jest.requireActual('./components/cards/DashboardAlertCenterCard').default;
  return {
    __esModule: true,
    default: ({ showAirbnbReviews }) => (
      <>
        <h1>Dashboard</h1>
        <DashboardAlertCenterCard showAirbnbReviews={showAirbnbReviews} />
      </>
    ),
  };
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  jest.clearAllMocks();
});

test('shows Airbnb reviews after an Admin signs in and navigates to the Dashboard', async () => {
  window.history.replaceState(null, '', '/login');
  const payload = window.btoa(JSON.stringify({ roles: ['ROLE_ADMIN'] }));
  api.post.mockResolvedValueOnce({ data: { token: `test.${payload}.test` } });
  api.get.mockResolvedValueOnce({ data: { items: [] } });

  render(<App />);

  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@example.test' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(window.location.pathname).toBe('/dashboard');
  expect(await screen.findByRole('button', { name: 'Reseñas Airbnb (0)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pagos de Servicios (0)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Conflictos de Reservas (0)' })).toBeInTheDocument();
});
