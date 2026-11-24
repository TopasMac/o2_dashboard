import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import HKCancelDialog from './HKCancelDialog';

const row = { id: 42, unit_name: 'Test Unit', service_date: '2026-11-23' };
test('dismissal does not cancel the cleaning', () => {
  const onClose = jest.fn(); const onConfirm = jest.fn();
  render(<HKCancelDialog row={row} onClose={onClose} onConfirm={onConfirm} />);
  expect(screen.getByRole('dialog')).toHaveTextContent('Confirm Cancel Test Unit on 23-11-2026?');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});
test('confirmation closes the dialog and submits the selected row once', () => {
  const onClose = jest.fn(); const onConfirm = jest.fn();
  render(<HKCancelDialog row={row} onClose={onClose} onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledWith(row);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
