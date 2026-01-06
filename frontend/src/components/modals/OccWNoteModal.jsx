import React, { useEffect, useState } from 'react';
import { Box, Button, Modal, Typography, TextareaAutosize } from '@mui/material';

const style = {
  position: 'absolute',
  top: '44%',
  left: '69%',
  transform: 'translate(-50%, -50%)',
  maxWidth: 200,
  maxHeight: 300,
  overflowY: 'auto',
  bgcolor: 'background.paper',
  borderRadius: 2,
  boxShadow: 3,
  p: 3,
  outline: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const headerStyle = {
  backgroundColor: '#1E6F68', // updated teal color
  color: '#fff',
  padding: '8px 16px',
  fontWeight: 'bold',
  fontSize: '1.25rem',
};

const textareaStyle = {
  width: '100%',
  minHeight: 120,
  resize: 'vertical',
  padding: 8,
  fontSize: 14,
  borderRadius: 4,
  borderColor: '#ccc',
  border: '1px solid #ccc',
  fontFamily: 'Roboto, sans-serif',
  boxSizing: 'border-box',
};

const buttonContainerStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 1,
  marginTop: 0,
};

function OccWNoteModal({ open, note, initialNoteText, noteText, noteId, hasNote, onSave, onDelete, onClose, minRows, maxWidth, minWidth, headerText }) {
  const modalStyle = {
    ...style,
    ...(typeof maxWidth === 'number' ? { maxWidth } : {}),
    ...(typeof minWidth === 'number' ? { minWidth } : {}),
  };

  const [currentNote, setCurrentNote] = useState(note ?? initialNoteText ?? noteText ?? '');

  useEffect(() => {
    setCurrentNote(note ?? initialNoteText ?? noteText ?? '');
  }, [note, initialNoteText, noteText]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [open]);

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  const handleSave = () => {
    onSave(currentNote);
  };

  const handleDelete = () => {
    onDelete();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      aria-labelledby="occw-note-modal-title"
      aria-describedby="occw-note-modal-description"
      closeAfterTransition
      BackdropProps={{ onClick: handleBackdropClick }}
    >
      <Box sx={modalStyle}>
        <Box sx={headerStyle} id="occw-note-modal-title">
          {headerText || 'Occupancy Watch Note'}
        </Box>
        <TextareaAutosize
          aria-label="Occupancy watch note"
          minRows={minRows ?? 6}
          style={textareaStyle}
          value={currentNote}
          onChange={(e) => setCurrentNote(e.target.value)}
          autoFocus
        />
        <Box sx={buttonContainerStyle}>
          {hasNote !== false && (Boolean(noteId) || Boolean(note ?? initialNoteText ?? noteText)) && (
            <Button color="error" onClick={handleDelete} variant="outlined" size="small">
              Delete
            </Button>
          )}
          <Button
            onClick={onClose}
            variant="outlined"
            size="small"
            sx={{
              color: '#64748B',
              borderColor: '#64748B',
              '&:hover': {
                borderColor: '#64748B',
                backgroundColor: 'rgba(100,116,139,0.08)'
              }
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            size="small"
            sx={{ backgroundColor: '#1E6F68', color: '#fff', '&:hover': { backgroundColor: '#15524D' } }}
            disabled={currentNote.trim() === ''}
          >
            Save
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}

export default OccWNoteModal;
