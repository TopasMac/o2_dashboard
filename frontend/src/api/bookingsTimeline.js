import api from '../api';

export function getBookingsTimeline() {
  return api.get('/api/bookings-timeline').then(res => res.data);
}