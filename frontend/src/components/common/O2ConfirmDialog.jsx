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
 *
 * Buttons (backward compatible):
 * - confirmLabel: string (default: 'OK')
 * - cancelLabel: string (default: 'Cancel')
 * - thirdLabel: string | null (default: null)  // optional 3rd button
 *
 * Button styling (uses our global button classes by default):
 * - confirmClassName: string (default: 'btn-primary')
 * - cancelClassName: string (default: 'btn-danger')     // destructive (Discard)
 * - thirdClassName: string (default: 'btn-secondary')   // neutral (Cancel)
 *
 * Behavior:
 * - onConfirm: () => void
 * - onCancel: () => void          // optional; if omitted, cancel uses onClose
 * - onClose: () => void           // cancel/backdrop/escape/third button
 *
 * - loading: boolean (disables buttons)
 */
export default function O2ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  thirdLabel = null,
  confirmClassName = 'btn-primary',
  cancelClassName = 'btn-danger',     // destructive (Discard)
  thirdClassName = 'btn-secondary',   // neutral (Cancel)
  loading = false,
  onConfirm,
  onCancel,
  onClose,
}) {

  const handleClose = React.useCallback(() => {
    if (loading) return;
    onClose?.();
  }, [loading, onClose]);

  const handleCancel = React.useCallback(() => {
    if (loading) return;
    if (onCancel) {
      onCancel();
      return;
    }
    onClose?.();
  }, [loading, onCancel, onClose]);

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

      <DialogActions sx={{ px: 2, pb: 2, gap: 1, justifyContent: 'flex-end' }}>
        {/* Third action (usually Cancel → return to previous modal) */}
        {thirdLabel ? (
          <button
            type="button"
            className={thirdClassName}
            onClick={handleClose}
            disabled={loading}
          >
            {thirdLabel}
          </button>
        ) : null}

        {/* Secondary destructive action (e.g. Discard) */}
        <button
          type="button"
          className={cancelClassName}
          onClick={handleCancel}
          disabled={loading}
        >
          {cancelLabel}
        </button>

        {/* Primary action (e.g. Save) */}
        <button
          type="button"
          className={confirmClassName}
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