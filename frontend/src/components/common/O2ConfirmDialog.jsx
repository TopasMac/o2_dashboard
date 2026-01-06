import * as React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import '../layouts/Buttons.css';

/**
 * O2ConfirmDialog
 * -----------------------------------------------------------------------------
 * Replaces native window.confirm() with a styled, reusable MUI dialog.
 *
 * Props:
 * - open: boolean
 * - title: string | ReactNode
 * - description: string | ReactNode
 * - confirmLabel: string (default: 'OK')
 * - cancelLabel: string (default: 'Cancel')
 * - confirmColor: MUI button color (default: 'primary')
 * - confirmVariant: 'contained'|'outlined'|'text' (default: 'contained')
 * - cancelVariant: 'contained'|'outlined'|'text' (default: 'text')
 * - isDanger: boolean (if true, confirmColor defaults to 'error')
 * - loading: boolean (disables buttons)
 * - onConfirm: () => void
 * - onClose: () => void (called for cancel/backdrop/escape)
 */
export default function O2ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  confirmColor,
  confirmVariant = 'contained',
  cancelVariant = 'text',
  isDanger = false,
  loading = false,
  onConfirm,
  onClose,
}) {
  const resolvedConfirmColor = confirmColor || (isDanger ? 'error' : 'primary');

  const handleClose = React.useCallback(() => {
    if (loading) return;
    onClose?.();
  }, [loading, onClose]);

  const handleConfirm = React.useCallback(() => {
    if (loading) return;
    onConfirm?.();
  }, [loading, onConfirm]);

  return (
    <Dialog
      open={!!open}
      onClose={handleClose}
      aria-labelledby="o2-confirm-dialog-title"
      aria-describedby="o2-confirm-dialog-description"
      fullWidth
      maxWidth="xs"
    >
      {title ? (
        <DialogTitle id="o2-confirm-dialog-title">{title}</DialogTitle>
      ) : null}

      {description ? (
        <DialogContent>
          {typeof description === 'string' ? (
            <DialogContentText id="o2-confirm-dialog-description">
              {description}
            </DialogContentText>
          ) : (
            <div id="o2-confirm-dialog-description">{description}</div>
          )}
        </DialogContent>
      ) : null}

      <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
        <button
          type="button"
          className="btn-danger"
          onClick={handleClose}
          disabled={loading}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleConfirm}
          disabled={loading}
          autoFocus
        >
          {confirmLabel}
        </button>
      </DialogActions>
    </Dialog>
  );
}