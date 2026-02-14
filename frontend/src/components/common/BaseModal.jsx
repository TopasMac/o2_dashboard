import React, { useEffect, useMemo, useRef } from 'react';
import Draggable from 'react-draggable';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  Button,
  Stack,
  Paper,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import '../layouts/Buttons.css';

/**
 * BaseModal
 *
 * Reusable modal shell to keep layout consistency across the app.
 * - Escape closes (via MUI Modal)
 * - Backdrop click closes (configurable)
 * - Locks body scroll while open
 *
 * Props:
 *  - open: boolean
 *  - title: string | ReactNode
 *  - onClose: function(event, reason)  (reason: 'escapeKeyDown' | 'backdropClick' | 'closeButton' | 'action')
 *  - children: ReactNode
 *  - actions: ReactNode (rendered right-aligned in footer). If not provided, renders a default "Close" button.
 *  - width: number|string (default 520)
 *  - maxWidth: number|string (default '90vw')
 *  - minWidth: number|string (default 320)
 *  - maxHeight: number|string (default '85vh')
 *  - headerBg: string (default '#1E6F68')
 *  - headerTextColor: string (default '#fff')
 *  - disableBackdropClose: boolean (default false)
 *  - showCloseButton: boolean (default true)
 *  - draggable: boolean (default false) — when true, the modal can be dragged by its header
 */
export default function BaseModal({
  open,
  title,
  onClose,
  children,
  actions,
  width = 520,
  maxWidth = '90vw',
  minWidth = 320,
  maxHeight = '85vh',
  headerBg = '#1E6F68',
  headerTextColor = '#fff',
  disableBackdropClose = false,
  showCloseButton = true,
  draggable = false,
}) {
  // Body scroll lock (parity with OccWNoteModal)
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow || '';
    };
  }, [open]);

  const handleClose = (event, reason) => {
    // MUI passes: reason = 'backdropClick' | 'escapeKeyDown'
    if (reason === 'backdropClick' && disableBackdropClose) return;
    if (typeof onClose === 'function') onClose(event, reason);
  };

  const handleSubmit = (e) => {
    // Prevent any implicit submit bubbling to parent forms (can cause full page reload).
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  };

  const paperSx = useMemo(
    () => ({
      width,
      maxWidth,
      minWidth,
      maxHeight,
      borderRadius: 2,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }),
    [width, maxWidth, minWidth, maxHeight]
  );

  const PaperComponent = useMemo(() => {
    if (!draggable) return undefined;

    // Draggable handle: header only
    const handle = '#base-modal-drag-handle';

    // Cancel dragging when interacting with typical controls
    const cancel =
      'button, [role="button"], input, textarea, select, option, a, .MuiButtonBase-root, .MuiIconButton-root';

    // MUI Dialog will pass Paper props here
    return function DraggablePaper(props) {
      const nodeRef = useRef(null);
      return (
        <Draggable handle={handle} cancel={cancel} nodeRef={nodeRef}>
          <Paper {...props} ref={nodeRef} />
        </Draggable>
      );
    };
  }, [draggable]);

  const bodySx = useMemo(
    () => ({
      p: 2,
      overflowY: 'auto',
      flex: 1,
    }),
    []
  );

  const footerSx = useMemo(
    () => ({
      p: 2,
      borderTop: '1px solid rgba(0,0,0,0.08)',
      bgcolor: '#f8f9fa',
    }),
    []
  );

  const defaultActions = (
    <>
      <button
        type="button"
        className="btn-secondary"
        onClick={(e) => (typeof onClose === 'function' ? onClose(e, 'action') : null)}
      >
        Cancel
      </button>
    </>
  );

  return (
    <Dialog
      open={!!open}
      onClose={handleClose}
      aria-labelledby="base-modal-title"
      PaperComponent={PaperComponent}
      PaperProps={{ sx: paperSx }}
      maxWidth={false}
      fullWidth={false}
    >
      <Box
        id="base-modal-drag-handle"
        sx={{
          px: 2,
          py: 1.25,
          bgcolor: headerBg,
          color: headerTextColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: draggable ? 'move' : 'default',
          userSelect: 'none',
        }}
      >
        <Typography id="base-modal-title" variant="h6" sx={{ fontWeight: 'bold' }}>
          {title}
        </Typography>

        {showCloseButton && (
          <IconButton
            size="small"
            onClick={(e) => (typeof onClose === 'function' ? onClose(e, 'closeButton') : null)}
            sx={{ color: headerTextColor }}
            aria-label="Close"
          >
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <Box sx={bodySx}>{children}</Box>

        <Box sx={footerSx}>
          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            {actions || defaultActions}
          </Stack>
        </Box>
      </Box>
    </Dialog>
  );
}