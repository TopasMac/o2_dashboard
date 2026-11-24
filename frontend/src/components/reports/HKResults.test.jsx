import React from 'react';
import { render, screen, within } from '@testing-library/react';
import HKResults from './HKResults';

test('Cleaning Results shows Playa category balances and removes its HR deductions', () => {
  render(<HKResults report={{ summary: {
    playa_cleanings: { result: 85, categories: { 7: 70, 8: -10, 13: 25 }, counts: { 7: 13, 8: 5, 13: 0 }, fixed_hr_cost: 999 },
    tulum_cleanings: { result: 123, charged: 150, paid: 27 },
  } }} />);
  const card = within(screen.getByRole('table', { name: 'hk cleaning results' }));
  for (const [label, amount] of [['Playa del Carmen', '85'], ['Limpiezas (13)', '70'], ['Limpiezas Extra (5)', '-10'], ['Blancos Extra', '25']]) {
    expect(card.getByText(label).closest('tr').textContent).toContain(amount);
  }
  expect(card.queryByText('Fixed HR cost (Cleaner)')).toBeNull();
  expect(card.queryByText('Laundry')).toBeNull();
  expect(card.getByText('Tulum').closest('tr').textContent).toContain('123');
});
