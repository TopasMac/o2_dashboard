import * as React from 'react';
import { Typography } from '@mui/material';
import '../../../components/layouts/Buttons.css';

export default function O2ConfirmDialogMobile({
  open,
  title = 'Confirm',
  description = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  showCancel = true,
  onConfirm,
  onCancel,
  onClose,
  loading = false,
  confirmActsAsClose = false,

  // optional: map button classes per use-case
  confirmClassName = 'btn btn-primary',
  cancelClassName = 'btn btn-secondary',
}) {
  if (!open) return null;

  const handleClose = onCancel || onClose;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={loading ? undefined : handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px 10px 16px' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#111827' }}>{title}</div>
        </div>

        {description ? (
          <div style={{ padding: '0 16px 10px 16px' }}>
            {typeof description === 'string' ? (
              <Typography sx={{ whiteSpace: 'pre-wrap', color: '#374151' }}>{description}</Typography>
            ) : (
              description
            )}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: 16,
            borderTop: '1px solid #e5e7eb',
            background: '#fff',
          }}
        >
          {showCancel ? (
            <button
              type="button"
              className={cancelClassName}
              onClick={handleClose}
              disabled={loading}
              style={{ minHeight: 40 }}
            >
              {cancelLabel}
            </button>
          ) : null}

          <button
            type="button"
            className={confirmClassName}
            onClick={() => {
              if (loading) return;
              if (confirmActsAsClose) {
                handleClose && handleClose();
                return;
              }
              if (onConfirm) {
                onConfirm();
                return;
              }
              handleClose && handleClose();
            }}
            disabled={loading}
            autoFocus
            style={{ minHeight: 40 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}