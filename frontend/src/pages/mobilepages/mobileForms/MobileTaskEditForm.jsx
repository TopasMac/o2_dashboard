import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import MobileFormScaffold from './MobileFormScaffold.jsx';
import api from '../../../api.js';
import useCurrentUserAccess from '../../../hooks/useCurrentUserAccess.js';

/**
 * Mobile task editor:
 * - Opened from the dashboard Tasks card (notifications / my tasks).
 * - When coming from "New task", the status will already be in "in_progress"
 *   because the teal check / ack endpoint moved it from "open" to "in_progress".
 * - User can change status to:
 *    - Ongoing
 *    - Help
 *    - Checked
 *    - Done
 *    - Archived (only if the current user is also the creator of the task)
 */
export default function MobileTaskEditForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { employee, user } = useCurrentUserAccess();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  const [task, setTask] = React.useState(null);
  const [status, setStatus] = React.useState('in_progress');
  const [description, setDescription] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [existingAttachments, setExistingAttachments] = React.useState([]);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [markedForDeletion, setMarkedForDeletion] = React.useState([]); // array of attachment IDs

  const [comments, setComments] = React.useState([]);
  const [commentsLoading, setCommentsLoading] = React.useState(false);
  const [commentsError, setCommentsError] = React.useState(null);

  const [newComment, setNewComment] = React.useState('');
  const [addingComment, setAddingComment] = React.useState(false);
  const [addCommentError, setAddCommentError] = React.useState(null);

  const [selectedFiles, setSelectedFiles] = React.useState([]);
  const fileInputRef = React.useRef(null);


  const handleToggleMarkAttachment = (attachmentId) => {
    if (!attachmentId) return;
    setMarkedForDeletion((prev) =>
      prev.includes(attachmentId)
        ? prev.filter((id) => id !== attachmentId)
        : [...prev, attachmentId],
    );
  };

  const handleManageCancel = () => {
    setMarkedForDeletion([]);
    setManageOpen(false);
  };

  const handleManageSave = async () => {
    if (!id) {
      setManageOpen(false);
      return;
    }

    const idsToDelete = Array.isArray(markedForDeletion) ? markedForDeletion : [];
    if (idsToDelete.length === 0) {
      setManageOpen(false);
      return;
    }

    try {
      // Delete each marked attachment using the existing endpoint
      // (Later this can be optimized to a single batch endpoint.)
      await Promise.all(
        idsToDelete.map((attachmentId) =>
          api.delete(`/api/employee-tasks/${id}/attachments/${attachmentId}`),
        ),
      );

      // After deletion, refresh the task to get the updated attachments
      const response = await api.get(`/api/employee-tasks/${id}`);
      const data = response.data || response;
      const item = data.item || data;

      setTask(item);
      const incomingAttachments = Array.isArray(item.attachments) ? item.attachments : [];
      setExistingAttachments(incomingAttachments);
      setMarkedForDeletion([]);
      setManageOpen(false);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error saving attachment changes in MobileTaskEditForm:', e);
      // eslint-disable-next-line no-alert
      alert('Could not update attachments. Please try again.');
    }
  };

  const fromView = location.state && location.state.fromView ? location.state.fromView : null;

  const currentEmployeeId = employee?.id ?? null;
  const currentUserId = user?.id ?? null;

  React.useEffect(() => {
    let isMounted = true;

    const loadTask = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await api.get(`/api/employee-tasks/${id}`);
        const data = response.data || response;
        const item = data.item || data;

        if (!isMounted) return;

        setTask(item);
        setStatus(item.status || 'in_progress');
        setDescription(item.description || '');
        setNotes(item.notes || '');
        const incomingAttachments = Array.isArray(item.attachments) ? item.attachments : [];
        setExistingAttachments(incomingAttachments);
      } catch (e) {
        if (!isMounted) return;
        // eslint-disable-next-line no-console
        console.error('Error loading task in MobileTaskEditForm:', e);
        setError('Could not load the task.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadTask();

    return () => {
      isMounted = false;
    };
  }, [id]);

  React.useEffect(() => {
    if (!id) return;

    let isMounted = true;
    setCommentsLoading(true);
    setCommentsError(null);

    const loadComments = async () => {
      try {
        const response = await api.get(`/api/employee-tasks/${id}/comments`);
        const data = response.data || response;
        const items = data.items || data;
        if (!isMounted) return;
        setComments(Array.isArray(items) ? items : []);
      } catch (e) {
        if (!isMounted) return;
        // eslint-disable-next-line no-console
        console.error('Error loading comments in MobileTaskEditForm:', e);
        setCommentsError('Could not load activity.');
      } finally {
        if (isMounted) {
          setCommentsLoading(false);
        }
      }
    };

    loadComments();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const isCreator =
    !!task &&
    ((task.createdBy && task.createdBy.id && currentEmployeeId && task.createdBy.id === currentEmployeeId) ||
      (task.createdBy && task.createdBy.user && task.createdBy.user.id && currentUserId && task.createdBy.user.id === currentUserId));

  const isAdmin = !!user && Array.isArray(user.roles) && user.roles.includes('ROLE_ADMIN');
  const isTaskInfoReadOnly = !isCreator && !isAdmin;

  const handleSubmit = async (event) => {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (!id) {
      return;
    }

    const attachments = selectedFiles || [];
    const existingCount = Array.isArray(existingAttachments) ? existingAttachments.length : 0;
    const totalCount = existingCount + attachments.length;
    if (totalCount > 5) {
      // eslint-disable-next-line no-alert
      alert('You can have a maximum of 5 attachments per task (existing + new).');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Update only the status here; description/comments can be handled by a dedicated comments flow.
      await api.patch(`/api/employee-tasks/${id}/status`, {
        status,
      });

      // Update notes (if supported by the backend); failure here should not block navigation.
      try {
        await api.patch(`/api/employee-tasks/${id}`, {
          notes,
        });
      } catch (notesErr) {
        // eslint-disable-next-line no-console
        console.error('Error updating task notes in MobileTaskEditForm:', notesErr);
      }

      // If there are attachments, upload them via a separate multipart request
      if (attachments.length > 0) {
        const formData = new FormData();
        attachments.forEach((file, idx) => {
          formData.append(`files[${idx}]`, file);
        });

        try {
          await api.post(`/api/employee-tasks/${id}/attachments`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
        } catch (uploadErr) {
          // eslint-disable-next-line no-console
          console.error('Error uploading task attachments in MobileTaskEditForm:', uploadErr);
          // We do not block navigation on attachment upload failure, but you could surface a toast here if desired.
        }
      }

      // After saving, route to the mobile dashboard, preserving the originating view when available.
      navigate('/m/dashboard', {
        state: fromView ? { restoreView: fromView } : undefined,
        replace: true,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error saving task in MobileTaskEditForm:', e);
      setError('Could not save the task.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Always go back to the mobile dashboard, restoring the originating view when available.
    navigate('/m/dashboard', {
      state: fromView ? { restoreView: fromView } : undefined,
      replace: true,
    });
  };

  const statusOptions = React.useMemo(() => {
    const options = [
      { value: 'in_progress', label: 'Ongoing' },
      { value: 'needs_help', label: 'Help' },
      { value: 'reviewed', label: 'Checked' },
      { value: 'completed', label: 'Done' },
    ];

    if (isCreator) {
      options.push({ value: 'archived', label: 'Archived' });
    }

    return options;
  }, [isCreator]);

  const disabled = loading || saving || !task;

  const formatDateTimeShort = (value) => {
    if (!value) return '';

    // Try to parse as Date and format using Cancun timezone, similar to desktop drawer.
    const dateObj = new Date(value);
    if (!Number.isNaN(dateObj.getTime())) {
      try {
        return dateObj.toLocaleString('en-GB', {
          timeZone: 'America/Cancun',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch (e) {
        // fall through to manual formatting
      }
    }

    if (typeof value !== 'string') return '';

    let datePart = value;
    let timePart = '';

    if (value.includes(' ')) {
      const parts = value.split(' ');
      datePart = parts[0];
      timePart = parts[1] || '';
    }

    const datePieces = datePart.split('-');
    if (datePieces.length === 3) {
      const [, m, d] = datePieces;
      if (timePart) {
        const hhmm = timePart.slice(0, 5);
        return `${d}/${m} ${hhmm}`;
      }
      return `${d}/${m}`;
    }

    return value;
  };

  const formatDateDdMmYyyy = (value) => {
    if (!value) return '-';

    // Handle common string formats like "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
    if (typeof value === 'string') {
      let datePart = value;
      if (value.includes(' ')) {
        const parts = value.split(' ');
        datePart = parts[0];
      }
      const pieces = datePart.split('-');
      if (pieces.length === 3) {
        const [y, m, d] = pieces;
        return `${d}-${m}-${y}`;
      }
    }

    // Fallback: try to parse as Date
    const dateObj = new Date(value);
    if (!Number.isNaN(dateObj.getTime())) {
      const d = String(dateObj.getDate()).padStart(2, '0');
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const y = dateObj.getFullYear();
      return `${d}-${m}-${y}`;
    }

    return '-';
  };

  const handleAddComment = async () => {
    if (!id) return;
    const trimmed = newComment.trim();
    if (!trimmed) return;

    try {
      setAddingComment(true);
      setAddCommentError(null);

      const response = await api.post(`/api/employee-tasks/${id}/comments`, {
        content: trimmed,
      });

      const data = response.data || response;
      const item = data.item || data;

      if (item && item.id) {
        // Append the new comment; rendering uses reverse() so newest shows at top.
        setComments((prev) => [...prev, item]);
      }

      setNewComment('');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error adding comment in MobileTaskEditForm:', e);
      setAddCommentError('Could not add comment.');
    } finally {
      setAddingComment(false);
    }
  };

  return (
    <MobileFormScaffold
      title="Edit task"
      loading={loading}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      disableSubmit={disabled}
      submitLabel={saving ? 'Saving...' : 'Save'}
      stickyFooter={
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Button
            size="small"
            variant="outlined"
            color="error"
            type="button"
            onClick={handleCancel}
          >
            Cancel
          </Button>

          <Button
            size="small"
            variant="contained"
            type="button"
            disabled={disabled || saving}
            onClick={handleSubmit}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      }
    >
      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}

      {task && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {isTaskInfoReadOnly ? (
            <>
              <Box
                sx={{
                  borderRadius: 1,
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  backgroundColor: '#fafafa',
                  p: 1,
                }}
              >
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Title:</strong>{' '}
                  {task.title || '-'}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Unit:</strong>{' '}
                  {(task.unit && task.unit.unitName) || '-'}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Description:</strong>{' '}
                  {description || '-'}
                </Typography>
                <Typography variant="body2">
                  <strong>Created:</strong>{' '}
                  {formatDateDdMmYyyy(task.createdAt || task.created_at)}
                  <span style={{ marginLeft: 12 }}>
                    <strong>Due:</strong>{' '}
                    {formatDateDdMmYyyy(task.dueDate)}
                  </span>
                </Typography>
              </Box>

              <TextField
                select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                size="small"
                fullWidth
              >
                {statusOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                size="small"
                fullWidth
                multiline
                minRows={2}
              />
            </>
          ) : (
            <>
              <TextField
                label="Title"
                value={task.title || ''}
                InputProps={{ readOnly: true }}
                size="small"
                fullWidth
              />

              {task.unit && (
                <TextField
                  label="Unit"
                  value={task.unit.unitName || ''}
                  InputProps={{ readOnly: true }}
                  size="small"
                  fullWidth
                />
              )}

              <TextField
                select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                size="small"
                fullWidth
              >
                {statusOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                size="small"
                fullWidth
                multiline
                minRows={2}
              />

              <TextField
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                size="small"
                fullWidth
                multiline
                minRows={2}
              />
            </>
          )}
        </Box>
      )}

      {task && (
        <>
          {/* Attachments (max 5) */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
            <Typography variant="subtitle2">Attachments</Typography>
            {/* Visual attachments meter: 5 paperclip slots */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                mb: 1,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 0.5,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  {Array.from({ length: 5 }).map((_, idx) => {
                    const existingCount = Array.isArray(existingAttachments)
                      ? existingAttachments.length
                      : 0;
                    const newCount = Array.isArray(selectedFiles)
                      ? selectedFiles.length
                      : 0;
                    const totalCount = existingCount + newCount;
                    const isFilled = idx < totalCount;

                    return (
                      <AttachFileIcon
                        key={idx}
                        sx={{
                          fontSize: 24,
                          opacity: isFilled ? 1 : 0.4,
                          color: isFilled ? '#1E6F68' : 'text.disabled',
                        }}
                      />
                    );
                  })}
                  <Button
                    type="button"
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.click();
                      }
                    }}
                    sx={{
                      textTransform: 'none',
                      borderColor: '#1E6F68',
                      color: '#1E6F68',
                      ml: 1,
                      '&:hover': {
                        borderColor: '#1E6F68',
                      },
                    }}
                  >
                    Upload
                  </Button>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <Button
                    type="button"
                    size="small"
                    variant="outlined"
                    onClick={() => setManageOpen(true)}
                    sx={{
                      textTransform: 'none',
                    }}
                  >
                    Manage
                  </Button>
                </Box>
              </Box>
            </Box>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                const imageFiles = files.filter(
                  (file) =>
                    file &&
                    typeof file.type === 'string' &&
                    file.type.startsWith('image/'),
                );

                if (imageFiles.length < files.length) {
                  // eslint-disable-next-line no-alert
                  alert('Only image files are allowed. Non-image files were ignored.');
                }

                const existingCount = Array.isArray(existingAttachments) ? existingAttachments.length : 0;
                const maxTotal = 5;
                const availableSlots = Math.max(0, maxTotal - existingCount);

                if (availableSlots <= 0) {
                  // eslint-disable-next-line no-alert
                  alert('This task already has 5 attachments. Please remove one before adding more.');
                } else {
                  setSelectedFiles((prev) => {
                    const merged = [...prev, ...imageFiles];
                    if (merged.length > availableSlots) {
                      // eslint-disable-next-line no-alert
                      alert(`You can add a maximum of ${availableSlots} more file(s). Extra files were ignored.`);
                    }
                    return merged.slice(0, availableSlots);
                  });
                }

                // reset the input so the same file can be selected again if removed
                if (e.target) {
                  // eslint-disable-next-line no-param-reassign
                  e.target.value = '';
                }
              }}
            />

          </Box>
        </>
      )}

      {task && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Activity
          </Typography>

          {commentsLoading && (
            <Typography variant="caption" color="text.secondary">
              Loading activity...
            </Typography>
          )}

          {commentsError && (
            <Typography variant="caption" color="error">
              {commentsError}
            </Typography>
          )}

          {!commentsLoading && !commentsError && comments.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              No activity yet.
            </Typography>
          )}

          {!commentsLoading && !commentsError && comments.length > 0 && (
            <Box
              sx={{
                mt: 0.5,
                borderRadius: 1,
                border: '1px solid rgba(0, 0, 0, 0.08)',
                backgroundColor: '#fff',
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              {[...comments].reverse().map((comment, index, array) => {
                const createdLabel = formatDateTimeShort(
                  comment.createdAt || comment.created_at
                );
                const authorLabel =
                  (comment.author && comment.author.shortName) ||
                  (comment.employee && comment.employee.shortName) ||
                  (task && task.createdBy && task.createdBy.shortName) ||
                  'Comment';

                const bodyText =
                  comment.message || comment.comment || comment.content || '';

                const isLast = index === array.length - 1;

                return (
                  <Box
                    key={comment.id}
                    sx={{
                      px: 1,
                      py: 0.75,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        mb: 0.25,
                      }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {authorLabel}
                      </Typography>
                      {createdLabel && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          {createdLabel}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="body2">
                      {bodyText}
                    </Typography>
                    {!isLast && (
                      <Box
                        sx={{
                          my: 0.75,
                          borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                          width: '40%',
                          mx: 'auto',
                        }}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          )}

          <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {addCommentError && (
              <Typography variant="caption" color="error">
                {addCommentError}
              </Typography>
            )}
            <TextField
              label="Add comment"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={2}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="button"
                size="small"
                variant="contained"
                onClick={handleAddComment}
                disabled={addingComment || !newComment.trim()}
                sx={{ textTransform: 'none' }}
              >
                {addingComment ? 'Sending...' : 'Send'}
              </Button>
            </Box>
          </Box>
        </Box>
      )}
      {manageOpen && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 1400,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top bar */}
          <Box
            sx={{
              p: 1.5,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
            }}
          >
            <Typography variant="subtitle1">Manage attachments</Typography>
            <Button
              type="button"
              size="small"
              onClick={handleManageCancel}
              sx={{ textTransform: 'none' }}
            >
              Close
            </Button>
          </Box>

          {/* Scrollable images area */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 1.5,
              backgroundColor: '#f5f5f5',
            }}
          >
            {Array.isArray(existingAttachments) && existingAttachments.length > 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                {existingAttachments.map((att) => {
                  const isMarked =
                    Array.isArray(markedForDeletion) &&
                    markedForDeletion.includes(att.id);

                  return (
                    <Box
                      key={att.id}
                      sx={{
                        position: 'relative',
                        borderRadius: 1,
                        overflow: 'hidden',
                        backgroundColor: '#000',
                      }}
                    >
                      {att.url && (
                        <Box
                          component="img"
                          src={att.url}
                          alt="Attachment"
                          sx={{
                            width: '100%',
                            maxHeight: 260,
                            objectFit: 'contain',
                            backgroundColor: '#000',
                          }}
                        />
                      )}
                      {/* Trash icon overlay */}
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          backgroundColor: 'rgba(255, 255, 255, 0.85)',
                        }}
                      >
                        <DeleteOutlineIcon
                          onClick={() => handleToggleMarkAttachment(att.id)}
                          sx={{
                            fontSize: 20,
                            cursor: 'pointer',
                            color: isMarked ? '#c62828' : 'rgba(0, 0, 0, 0.54)',
                          }}
                        />
                      </Box>
                      {isMarked && (
                        <Box
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            border: '2px solid #c62828',
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                    </Box>
                  );
                })}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No attachments to manage.
              </Typography>
            )}
          </Box>

          {/* Sticky footer with Save / Cancel */}
          <Box
            sx={{
              py: 2.25,
              px: 1.5,
              borderTop: '1px solid rgba(0, 0, 0, 0.12)',
              backgroundColor: '#fff',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <Button
                type="button"
                size="medium"
                variant="outlined"
                onClick={handleManageCancel}
                sx={{
                  textTransform: 'none',
                  minWidth: 96,
                  px: 2.5,
                  py: 0.75,
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="medium"
                variant="contained"
                onClick={handleManageSave}
                disabled={
                  !Array.isArray(markedForDeletion) || markedForDeletion.length === 0
                }
                sx={{
                  textTransform: 'none',
                  minWidth: 96,
                  px: 2.5,
                  py: 0.75,
                  backgroundColor: '#1E6F68',
                  '&:hover': {
                    backgroundColor: '#155049',
                  },
                }}
              >
                Save
              </Button>
            </Box>
          </Box>
        </Box>
      )}
    </MobileFormScaffold>
  );
}