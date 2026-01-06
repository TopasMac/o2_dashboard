import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';

/**
 * MobileFormScaffold
 * A reusable layout wrapper for mobile forms.
 *
 * Props:
 * - title: string
 * - onBack: function (optional) - called when back button is pressed
 * - children: form content
 * - footer: (deprecated) optional custom footer node (prefer presets; avoid passing this)
 * - onSubmit: optional submit handler (if provided, wraps content in a form)
 * - submitLabel: label for the default submit button (if footer is not provided)
 * - submitDisabled: boolean to disable the default submit button
 * - actionsDisabled: boolean to disable non-submit actions (Cancel/Draft/Delete) (default false)
 * - showCancel: boolean (default true) - scaffold owns footer via preset
 * - showSubmit: boolean (default true) - scaffold owns footer via preset
 * - showDraft: boolean (default false) - scaffold owns footer via preset
 * - draftLabel: string (default "Guardar borrador")
 * - onDraft: function
 * - showDelete: boolean (default false) - scaffold owns footer via preset
 * - cancelLabel: string (default "Cancelar")
 * - deleteLabel: string (default "Eliminar")
 * - onCancel: function
 * - onDelete: function
 * - preset: 'new' | 'edit' (default 'new')
 */
export default function MobileFormScaffold({
  title,
  onBack,
  children,
  footer = null,
  stickyFooter = null, // deprecated alias
  preset = 'new',
  onSubmit,
  submitLabel = 'Guardar',
  submitDisabled = false,
  actionsDisabled = false,
  showCancel = true,
  showSubmit = true,
  showDraft = false,
  draftLabel = 'Guardar borrador',
  onDraft,
  showDelete,
  cancelLabel = 'Cancelar',
  deleteLabel = 'Eliminar',
  onCancel,
  onDelete,
}) {
  const handleFormSubmit = (e) => {
    if (onSubmit) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  const isEdit = String(preset).toLowerCase() === 'edit';
  const canDelete = isEdit && (typeof showDelete === 'boolean' ? showDelete : (typeof onDelete === 'function'));

  const resolvedFooter = footer ?? stickyFooter;
  if (process.env.NODE_ENV !== 'production' && resolvedFooter) {
    // eslint-disable-next-line no-console
    console.warn('MobileFormScaffold: custom footer provided. Prefer using preset-based footer via props.');
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#f5f7f8',
      }}
    >
      <Box
        component={onSubmit ? 'form' : 'div'}
        onSubmit={onSubmit ? handleFormSubmit : undefined}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* HEADER */}
        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.5,
            borderBottom: '1px solid #E0E6E8',
            backgroundColor: '#ffffff',
          }}
        >
          {onBack && (
            <IconButton
              size="small"
              onClick={onBack}
              aria-label="Volver"
              sx={{ mr: 1 }}
            >
              <ArrowBackIosNewIcon fontSize="small" />
            </IconButton>
          )}
          {title && (
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
          )}
        </Box>

        {/* BODY (scrollable) */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 2,
            py: 2,
          }}
        >
          {children}
        </Box>

        {/* FOOTER (sticky) */}
        <Box
          sx={{
            flexShrink: 0,
            borderTop: '1px solid #E0E6E8',
            background: '#fff',
            px: 2,
            py: 1.5,
          }}
        >
          {resolvedFooter ? (
            resolvedFooter
          ) : (
            <div
              className="form-actions"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 12,
                width: '100%',
              }}
            >
              {/* Left group (delete on edit) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {canDelete && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={onDelete}
                    disabled={actionsDisabled}
                  >
                    {deleteLabel}
                  </button>
                )}
              </div>

              {/* Left actions group (cancel + draft) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {showCancel && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onCancel}
                    disabled={actionsDisabled}
                  >
                    {cancelLabel}
                  </button>
                )}

                {showDraft && typeof onDraft === 'function' && (
                  <button
                    type="button"
                    className="btn btn-info"
                    onClick={onDraft}
                    disabled={actionsDisabled}
                  >
                    {draftLabel}
                  </button>
                )}
              </div>

              {/* Right group (submit) */}
              {showSubmit && onSubmit && (
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitDisabled}
                  >
                    {submitLabel}
                  </button>
                </div>
              )}
            </div>
          )}
        </Box>
      </Box>
    </Box>
  );
}