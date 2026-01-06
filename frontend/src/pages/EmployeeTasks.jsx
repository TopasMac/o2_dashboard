import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Chip, Typography, Button, Stack, Divider, IconButton, TextField } from '@mui/material';
import MenuItem from '@mui/material/MenuItem';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import PageScaffold from '../components/layout/PageScaffold';
import TablePageHeader from '../components/layout/TablePageHeader';
import TableLite from '../components/layout/TableLite';
import api from '../api';
import AppDrawer from '../components/common/AppDrawer';
import EmployeeTasksFormRHF from '../components/forms/EmployeeTasksFormRHF';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { formatDateCancun, formatDateTimeCancun, formatTimeCancun } from '../utils/dateTimeCancun';

const STATUS_LABELS = {
  open: 'New',
  in_progress: 'Ongoing',
  needs_help: 'Help',
  reviewed: 'Checked',
  completed: 'Done',
  archived: 'Archived',
};

const PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

const STATUS_COLORS = {
  open: 'default',
  in_progress: 'info',
  needs_help: 'warning',
  completed: 'success',
  reviewed: 'secondary',
  archived: 'default',
};


const PRIORITY_COLORS = {
  low: 'default',
  normal: 'info',
  high: 'error',
};

const STATUS_TEXT_COLOR_MAP = {
  open: 'text.secondary',      // New - grey
  in_progress: 'info.main',    // Ongoing - blue
  needs_help: 'warning.main',  // Help - yellow/amber
  completed: 'success.main',   // Completed - teal/green
  reviewed: 'secondary.main',  // Reviewed - purple
  archived: 'text.disabled',   // Done (archived) - light grey
};

const STATUS_DROPDOWN_OPTIONS = ['needs_help', 'reviewed', 'completed', 'archived'];

const PRIORITY_TEXT_COLOR_MAP = {
  low: 'text.secondary',
  normal: 'info.main',
  high: 'error.main',
};

const EmployeeTasks = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Persist whether we arrived here from another page (e.g. Dashboard notification)
  // so it survives the navigate-replace that clears route state.
  const [openedFromExternal] = useState(() => Boolean(location.state?.openTaskId));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('all'); // 'notifications' | 'my' | 'all'
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [formOptions, setFormOptions] = useState({ employees: [], units: [] });
  const [formOptionsLoading, setFormOptionsLoading] = useState(false);
  const [formOptionsError, setFormOptionsError] = useState(null);

  const [attachmentsToDelete, setAttachmentsToDelete] = useState([]);
  const [attachmentsDeleting, setAttachmentsDeleting] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const [initialTaskSnapshot, setInitialTaskSnapshot] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = {
        view: viewMode || 'notifications',
      };
      if (statusFilter) {
        params.status = statusFilter;
      }

      const resp = await api.get('/api/employee-tasks/notifications', { params });
      const data = resp.data || {};
      const payload = data.data || data;
      const items = Array.isArray(payload.items) ? payload.items : [];

      // Filter out archived (Done) tasks in My Tasks and All Tasks
      let filtered = items;
      if (viewMode === 'my' || viewMode === 'all') {
        filtered = items.filter((t) => t.status !== 'archived');
      }

      const mapped = filtered.map((t) => ({
        ...t,
        employeeShortName:
          (t.employee && (t.employee.shortName || t.employee.name)) ||
          t.assignedToLabel ||
          '',
        statusLabel: STATUS_LABELS[t.status] || t.status || '',
      }));

      setRows(mapped);
    } catch (e) {
      console.error('Failed to load employee tasks', e);
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, viewMode]);

  const loadFormOptions = useCallback(async () => {
    setFormOptionsLoading(true);
    setFormOptionsError(null);
    try {
      const resp = await api.get('/api/employee-tasks/form-options');
      const data = resp.data || {};
      const payload = data.payload || {};
      setFormOptions({
        employees: Array.isArray(payload.employees) ? payload.employees : [],
        units: Array.isArray(payload.units) ? payload.units : [],
      });
    } catch (e) {
      console.error('Failed to load task form options', e);
      setFormOptionsError('Failed to load form options');
    } finally {
      setFormOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    loadFormOptions();
  }, [loadFormOptions]);

  // If we arrived here with a specific task to open (e.g. from Dashboard notifications),
  // fetch the task and open the drawer.
  useEffect(() => {
    const taskId = location.state?.openTaskId;
    if (!taskId) return;

    (async () => {
      try {
        const resp = await api.get(`/api/employee-tasks/${taskId}`);
        const data = resp.data || {};
        const item = data.item || data;

        setSelectedTask(item);
        setInitialTaskSnapshot(item);
        setNotesDraft(item.notes || '');
        setNewComment('');
        setAttachmentsToDelete([]);
        setCommentsError(null);
      } catch (e) {
        console.error('Failed to open task from route state', e);
      }
    })();

    // Clear route state so refresh/back doesn't auto-open again
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTask) {
      setComments([]);
      setCommentsError(null);
      setCommentsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchComments = async () => {
      setCommentsLoading(true);
      setCommentsError(null);
      try {
        const resp = await api.get(`/api/employee-tasks/${selectedTask.id}/comments`);
        const data = resp.data;
        const items = Array.isArray(data.items) ? data.items : [];
        if (!cancelled) {
          setComments(items);
        }
      } catch (e) {
        console.error('Failed to load task comments', e);
        if (!cancelled) {
          setCommentsError('Failed to load comments');
        }
      } finally {
        if (!cancelled) {
          setCommentsLoading(false);
        }
      }
    };

    fetchComments();

    return () => {
      cancelled = true;
    };
  }, [selectedTask]);

  const handleRowClick = async (row) => {
    if (!row) return;
    try {
      const resp = await api.get(`/api/employee-tasks/${row.id}`);
      const data = resp.data || {};
      const item = data.item || data;
      const taskData = item || row;
      setSelectedTask(taskData);
      setInitialTaskSnapshot(taskData);
      setNotesDraft(taskData.notes || '');
      setNewComment('');
      setAttachmentsToDelete([]);
      setCommentsError(null);
    } catch (e) {
      console.error('Failed to load task details', e);
      setSelectedTask(row);
      setInitialTaskSnapshot(row);
      setNotesDraft(row.notes || '');
      setNewComment('');
      setAttachmentsToDelete([]);
      setCommentsError(null);
    }
  };

  const handleStatusFilterChange = (value) => {
    setStatusFilter(value || '');
  };

  const handleAddTask = () => {
    setCreateOpen(true);
    if (
      (!formOptions.employees || formOptions.employees.length === 0) &&
      (!formOptions.units || formOptions.units.length === 0)
    ) {
      loadFormOptions();
    }
  };

  const handleCreateTaskSubmit = async (payload) => {
    try {
      setCreateSubmitting(true);
      await api.post('/api/employee-tasks', payload);
      await loadTasks();
      setCreateOpen(false);
    } catch (e) {
      console.error('Failed to create task', e);
      // Optionally, we could surface an error message here later
    } finally {
      setCreateSubmitting(false);
    }
  };

  const ackTask = useCallback(
    async (taskId) => {
      if (!taskId) return;
      try {
        await api.post(`/api/employee-tasks/${taskId}/ack`);
      } catch (e) {
        console.error('Failed to acknowledge task notification', e);
      }
    },
    []
  );

  const toggleAttachmentSelection = (attachmentId) => {
    if (!attachmentId) return;
    setAttachmentsToDelete((prev) =>
      prev.includes(attachmentId)
        ? prev.filter((id) => id !== attachmentId)
        : [...prev, attachmentId]
    );
  };

  const handleDeleteSelectedAttachments = async () => {
    if (!selectedTask || attachmentsToDelete.length === 0) return;

    try {
      setAttachmentsDeleting(true);

      for (const attId of attachmentsToDelete) {
        try {
          await api.delete(
            `/api/employee-tasks/${selectedTask.id}/attachments/${attId}`
          );
        } catch (e) {
          console.error('Failed to delete attachment', attId, e);
        }
      }

      // Clear local selection after successful deletes
      setAttachmentsToDelete([]);
    } catch (e) {
      console.error('Failed to delete selected attachments', e);
    } finally {
      setAttachmentsDeleting(false);
    }
  };

  // Helper to download attachments without navigating away
  const handleDownloadAttachment = async (url, fileName) => {
    if (!url) return;

    try {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) {
        throw new Error(`Failed to fetch attachment: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download =
        fileName ||
        (typeof url === 'string'
          ? url.split('/').pop().split('?')[0] || 'attachment'
          : 'attachment');

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error('Failed to download attachment', e);
      // Fallback: open in a new tab if direct download fails
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (openErr) {
        console.error('Failed to open attachment in new tab', openErr);
      }
    }
  };

  const handleStatusChange = async (nextStatus, taskOverride) => {
    const target = taskOverride || selectedTask;
    if (!target || !nextStatus) return;

    try {
      setStatusUpdating(true);
      await api.patch(`/api/employee-tasks/${target.id}/status`, {
        status: nextStatus,
      });

      // Update local state so UI reflects the new status immediately
      setRows((prev) =>
        prev.map((row) =>
          row.id === target.id ? { ...row, status: nextStatus } : row
        )
      );
      setSelectedTask((prev) =>
        prev && prev.id === target.id ? { ...prev, status: nextStatus } : prev
      );
    } catch (e) {
      console.error('Failed to update task status', e);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask) return;

    const trimmed = (newComment || '').trim();
    const hasNewCommentLocal = trimmed.length > 0;
    const hasMarkedAttachmentsLocal = attachmentsToDelete.length > 0;
    const hasStatusChangeLocal =
      !!initialTaskSnapshot &&
      selectedTask.status !== initialTaskSnapshot.status;
    const hasNotesChangeLocal =
      !!selectedTask &&
      typeof notesDraft === 'string' &&
      (selectedTask.notes || '') !== notesDraft;

    if (
      !hasNewCommentLocal &&
      !hasMarkedAttachmentsLocal &&
      !hasStatusChangeLocal &&
      !hasNotesChangeLocal
    ) {
      return;
    }

    try {
      setCommentSubmitting(true);

      // 1) Add comment if present
      if (hasNewCommentLocal) {
        const resp = await api.post(
          `/api/employee-tasks/${selectedTask.id}/comments`,
          {
            content: trimmed,
          }
        );
        const data = resp.data;
        const item = data && data.item ? data.item : null;

        if (item) {
          setComments((prev) => [...prev, item]);
        }
        setNewComment('');
      }

      // 2) Update notes if they changed
      if (hasNotesChangeLocal) {
        try {
          await api.patch(`/api/employee-tasks/${selectedTask.id}`, {
            notes: notesDraft,
          });
        } catch (notesErr) {
          // eslint-disable-next-line no-console
          console.error('Failed to update notes for task', selectedTask.id, notesErr);
        }
      }

      // 3) Delete attachments if any are marked
      if (hasMarkedAttachmentsLocal) {
        await handleDeleteSelectedAttachments();
      }

      // 4) For notifications view, acknowledge after save
      if (viewMode === 'notifications') {
        await ackTask(selectedTask.id);
      }

      // 5) Refresh main table and close the drawer
      await loadTasks();
      setAttachmentsToDelete([]);
      setInitialTaskSnapshot(null);
      setSelectedTask(null);
    } catch (e) {
      console.error('Failed to add comment', e);
      setCommentsError('Failed to add comment');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleCloseDrawer = async () => {
    if (viewMode === 'notifications' && selectedTask?.id) {
      await ackTask(selectedTask.id);
      await loadTasks();
    }

    setAttachmentsToDelete([]);
    setNewComment('');
    setCommentsError(null);
    setInitialTaskSnapshot(null);
    setSelectedTask(null);

    // If we arrived here from another page (Dashboard notification), go back
    if (openedFromExternal) {
      navigate(-1);
    }
  };

  const columns = useMemo(
    () => {
      // Notifications view: custom layout
      if (viewMode === 'notifications') {
        return [
          {
            key: 'dates',
            header: 'Date',
            width: 170,
            render: (_value, row) => {
              if (!row) {
                return null;
              }

              const accentColor =
                row.dueStatus === 'overdue'
                  ? 'error.main'
                  : row.dueStatus === 'due_soon'
                  ? 'warning.main'
                  : undefined;

              // Updated at (fallback to createdAt): dd/mm/yyyy (Cancun time)
              let dateDisplay = '—';
              if (row.updatedAt || row.createdAt) {
                const raw = row.updatedAt || row.createdAt;
                dateDisplay = formatDateCancun(raw);
              }

              // Who did the update: updatedByShortName, updatedBy.shortName, or lastComment author
              const updatedByName =
                row.updatedByShortName ||
                row.updatedBy?.shortName ||
                row.lastComment?.authorShortName ||
                row.lastComment?.author?.shortName ||
                '—';

              return (
                <Box>
                  <Typography
                    variant="body2"
                    sx={{ color: accentColor || 'text.primary' }}
                  >
                    {dateDisplay}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: accentColor || 'text.secondary' }}
                  >
                    {updatedByName}
                  </Typography>
                </Box>
              );
            },
          },
          {
            key: 'title',
            header: 'Task',
            minWidth: 220,
            render: (_value, row) => {
              if (!row) return null;

              const accentColor =
                row.dueStatus === 'overdue'
                  ? 'error.main'
                  : row.dueStatus === 'due_soon'
                  ? 'warning.main'
                  : undefined;

              // Bottom row: unitName • subtitle (if available)
              const unitName = row.unitName || row.unit?.unitName || '';
              const subtitle = row.subtitle || row.description || '';
              let metaLine = '';
              if (unitName && subtitle) {
                metaLine = `${unitName} • ${subtitle}`;
              } else if (unitName) {
                metaLine = unitName;
              } else if (subtitle) {
                metaLine = subtitle;
              }

              return (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 0.5,
                      mt: 0.25,
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await handleRowClick(row);
                      }}
                      sx={{
                        color:
                          (row.lastComment ||
                            (typeof row.commentsCount === 'number' &&
                              row.commentsCount > 0))
                            ? '#1E6F68'
                            : 'rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      <ChatBubbleOutlineIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await handleRowClick(row);
                      }}
                      sx={{
                        color:
                          row.hasAttachments ||
                          (typeof row.attachmentsCount === 'number' &&
                            row.attachmentsCount > 0) ||
                          (Array.isArray(row.attachments) && row.attachments.length > 0)
                            ? '#1E6F68'
                            : 'rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      <AttachFileOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Box>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ color: accentColor || 'text.primary' }}
                    >
                      {row.title}
                    </Typography>
                    {metaLine && (
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          mt: 0.25,
                          color: accentColor || 'text.secondary',
                        }}
                      >
                        {metaLine}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            },
          },
          {
            key: 'notification',
            header: 'Notification',
            minWidth: 220,
            render: (_value, row) => {
              if (!row) return null;

              const typeLabel = (() => {
                // If we detect an actual status change, always label it as such
                if (
                  row.oldStatus &&
                  row.newStatus &&
                  row.oldStatus !== row.newStatus
                ) {
                  return 'Status change';
                }
                switch (row.type) {
                  case 'status_change':
                    return 'Status change';
                  case 'new_comment':
                    return 'New comment';
                  case 'overdue':
                    return 'Overdue';
                  default:
                    return 'Update';
                }
              })();

              const detail = (() => {
                if (row.oldStatus && row.newStatus && row.oldStatus !== row.newStatus) {
                  const fromLabel = STATUS_LABELS[row.oldStatus] || row.oldStatus;
                  const toLabel = STATUS_LABELS[row.newStatus] || row.newStatus;
                  const fromColor =
                    STATUS_TEXT_COLOR_MAP[row.oldStatus] || 'text.secondary';
                  const toColor =
                    STATUS_TEXT_COLOR_MAP[row.newStatus] || 'text.secondary';

                  return (
                    <>
                      <Box
                        component="span"
                        sx={{ color: fromColor }}
                      >
                        {fromLabel}
                      </Box>
                      {' \u2192 '}
                      <Box
                        component="span"
                        sx={{ color: toColor }}
                      >
                        {toLabel}
                      </Box>
                    </>
                  );
                }
                if (row.lastComment && row.lastComment.content) {
                  const content = String(row.lastComment.content);
                  return content.length > 80 ? `${content.slice(0, 77)}...` : content;
                }
                if (row.dueStatus === 'overdue') {
                  return 'Task is overdue';
                }
                return '—';
              })();

              return (
                <Box>
                  <Typography variant="body2">{typeLabel}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {detail}
                  </Typography>
                </Box>
              );
            },
          },
          {
            key: 'actions',
            header: 'Actions',
            width: 140,
            align: 'center',
            render: (_value, row) => {
              if (!row) return null;

              return (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                  }}
                >
                  <IconButton
                    size="small"
                    title="Checked"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await ackTask(row.id);
                      await loadTasks();
                    }}
                    sx={{ color: '#1E6F68' }}
                  >
                    <CheckCircleOutlineIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="View"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleRowClick(row);
                    }}
                    sx={{ color: '#1E6F68' }}
                  >
                    <VisibilityOutlinedIcon fontSize="small" />
                  </IconButton>
                </Box>
              );
            },
          },
        ];
      }

      // Default layout: My tasks / All tasks
      return [
        {
          key: 'dates',
          header: 'Date',
          width: 150,
          render: (_value, row) => {
            if (!row) return null;

            const accentColor =
              row.dueStatus === 'overdue'
                ? 'error.main'
                : row.dueStatus === 'due_soon'
                ? 'warning.main'
                : undefined;

            const dueDisplay = row.dueDate ? formatDateCancun(row.dueDate) : '—';
            const createdDisplay = row.createdAt ? formatDateCancun(row.createdAt) : '—';

            return (
              <Box>
                <Typography
                  variant="body2"
                  sx={{ color: accentColor || 'text.primary' }}
                >
                  <strong>Due:</strong> {dueDisplay}
                </Typography>

                <Typography
                  variant="caption"
                  sx={{
                    color: accentColor || 'text.secondary',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: accentColor || 'text.secondary',
                      display: 'inline-block',
                    }}
                  />
                  {createdDisplay}
                  {(() => {
                    const creatorName =
                      row.createdByShortName ||
                      row.createdBy?.shortName ||
                      row.createdByName ||
                      '';

                    if (!creatorName) {
                      return null;
                    }

                    return (
                      <>
                        {' | '}
                        {creatorName}
                      </>
                    );
                  })()}
                </Typography>
              </Box>
            );
          },
        },
        {
          key: 'title',
          header: 'Task',
          minWidth: 300,
          width: 300,
          render: (_value, row) => {
            if (!row) return null;

            const accentColor =
              row.dueStatus === 'overdue'
                ? 'error.main'
                : row.dueStatus === 'due_soon'
                ? 'warning.main'
                : undefined;

            return (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 0.5,
                    mt: 0.25,
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleRowClick(row);
                    }}
                    sx={{
                      color:
                        (row.lastComment ||
                          (typeof row.commentsCount === 'number' &&
                            row.commentsCount > 0))
                          ? '#1E6F68'
                          : 'rgba(0, 0, 0, 0.3)',
                    }}
                  >
                    <ChatBubbleOutlineIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleRowClick(row);
                    }}
                    sx={{
                      color:
                        row.hasAttachments ||
                        (typeof row.attachmentsCount === 'number' &&
                          row.attachmentsCount > 0) ||
                        (Array.isArray(row.attachments) && row.attachments.length > 0)
                          ? '#1E6F68'
                          : 'rgba(0, 0, 0, 0.3)',
                    }}
                  >
                    <AttachFileOutlinedIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{ color: accentColor || 'text.primary' }}
                  >
                    {row.title}
                  </Typography>
                  {/* Bottom row: unitName • subtitle */}
                  {(() => {
                    const unitName = row.unit?.unitName || row.unitName || '';
                    const subtitle = row.subtitle || row.description || '';
                    let meta = '';

                    if (unitName && subtitle) {
                      meta = `${unitName} • ${subtitle}`;
                    } else if (unitName) {
                      meta = unitName;
                    } else if (subtitle) {
                      meta = subtitle;
                    }

                    return meta ? (
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          mt: 0.25,
                          color: accentColor || 'text.secondary',
                        }}
                      >
                        {meta}
                      </Typography>
                    ) : null;
                  })()}
                </Box>
              </Box>
            );
          },
        },
        {
          key: 'employee',
          header: 'Employee',
          accessor: 'employeeShortName',
          filterable: true,
          filterType: 'autocomplete',
          width: 140,
          minWidth: 80,
          maxWidth: 140,
          render: (_value, row) => {
            if (!row) {
              return (
                <Typography variant="body2" color="text.secondary">
                  —
                </Typography>
              );
            }

            const accentColor =
              row.dueStatus === 'overdue'
                ? 'error.main'
                : row.dueStatus === 'due_soon'
                ? 'warning.main'
                : undefined;

            const label =
              row.employeeShortName ||
              (row.employee && row.employee.shortName) ||
              row.assignedToLabel ||
              '—';

            return (
              <Box>
                <Typography
                  variant="body2"
                  sx={{ color: accentColor || 'text.primary' }}
                >
                  {label}
                </Typography>
              </Box>
            );
          },
        },
        {
          key: 'status',
          header: 'Status',
          accessor: 'statusLabel',
          filterable: true,
          filterType: 'autocomplete',
          width: 90,
          align: 'center',
          render: (_value, row) => {
            const status = row && row.status ? row.status : 'open';
            const label = STATUS_LABELS[status] || status;
            const color =
              STATUS_TEXT_COLOR_MAP[status] || 'text.secondary';
            const isOpen = status === 'open';

            return (
              <Box sx={{ textAlign: 'center' }}>
                {/* Top row: Status */}
                <Typography
                  variant="body2"
                  sx={{
                    color,
                    cursor: isOpen ? 'pointer' : 'default',
                    fontWeight:
                      status === 'completed' || status === 'reviewed' ? 600 : 500,
                  }}
                  onClick={
                    isOpen
                      ? (e) => {
                          e.stopPropagation();
                          handleStatusChange('ongoing', row);
                        }
                      : undefined
                  }
                >
                  {label}
                </Typography>

                {/* Bottom row: Priority text */}
                {(() => {
                  const p = row && row.priority ? row.priority : 'normal';
                  const pLabel = PRIORITY_LABELS[p] || p;
                  const pColor =
                    p === 'low'
                      ? 'text.secondary'
                      : p === 'normal'
                      ? '#1E6F68'
                      : 'error.main';

                  return (
                    <Typography
                      variant="caption"
                      sx={{
                        color: pColor,
                        display: 'block',
                        mt: 0.25,
                      }}
                    >
                      {pLabel}
                    </Typography>
                  );
                })()}
              </Box>
            );
          },
        },
        {
          key: 'notes',
          header: 'Notes',
          width: 180,
          minWidth: 160,
          render: (_value, row) => {
            const notes = row?.notes || '';
            if (!notes) {
              return (
                <Typography variant="body2" color="text.secondary">
                  —
                </Typography>
              );
            }

            const truncated =
              notes.length > 80 ? notes.slice(0, 77) + '…' : notes;

            return (
              <Typography
                variant="body2"
                sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {truncated}
              </Typography>
            );
          },
        },
        {
          key: 'progress',
          header: 'Progress',
          width: 220,
          render: (_value, row) => {
            if (!row) {
              return null;
            }

            // Updated at (fallback to createdAt): DD/MM/YYYY (Cancun time)
            let updatedDisplay = '—';
            if (row.updatedAt || row.createdAt) {
              const raw = row.updatedAt || row.createdAt;
              updatedDisplay = formatDateCancun(raw);
            }

            // Detail line: prioritize last comment over status change
            const detailNode = (() => {
              // 1) If there is a last comment, show that as the primary activity
              const lc = row.lastComment;
              const rawContent =
                (lc && (lc.content || lc.message || lc.comment)) || '';
              if (lc && rawContent) {
                const authorName =
                  lc.authorShortName ||
                  lc.author?.shortName ||
                  lc.employee?.shortName ||
                  'Comment';

                const text =
                  typeof rawContent === 'string' ? rawContent : String(rawContent);
                const truncated =
                  text.length > 80 ? `${text.slice(0, 77)}...` : text;

                return (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 0.5,
                      mt: 0.25,
                    }}
                  >
                    <ChatBubbleOutlineIcon
                      fontSize="inherit"
                      sx={{ fontSize: 14, mt: '2px', color: 'text.secondary' }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      <strong>{authorName}:</strong> {truncated}
                    </Typography>
                  </Box>
                );
              }

              // 2) Otherwise, if we have a status change, show that
              if (row.oldStatus && row.newStatus && row.oldStatus !== row.newStatus) {
                const fromLabel = STATUS_LABELS[row.oldStatus] || row.oldStatus;
                const toLabel = STATUS_LABELS[row.newStatus] || row.newStatus;
                const fromColor =
                  STATUS_TEXT_COLOR_MAP[row.oldStatus] || 'text.secondary';
                const toColor =
                  STATUS_TEXT_COLOR_MAP[row.newStatus] || 'text.secondary';

                return (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    <Box component="span" sx={{ color: fromColor }}>
                      {fromLabel}
                    </Box>
                    {' \u2192 '}
                    <Box component="span" sx={{ color: toColor }}>
                      {toLabel}
                    </Box>
                  </Typography>
                );
              }

              // 3) Fallback: nothing notable
              return (
                <Typography variant="caption" color="text.secondary">
                  —
                </Typography>
              );
            })();

            return (
              <Box>
                <Typography variant="body2">
                  <strong>Updated:</strong> {updatedDisplay}
                </Typography>
                {detailNode}
              </Box>
            );
          },
        },
      ];
    },
    [viewMode, loadTasks, ackTask]
  );

  // Pending changes logic
  const trimmedComment = (newComment || '').trim();
  const hasNewComment = trimmedComment.length > 0;
  const hasMarkedAttachments = attachmentsToDelete.length > 0;
  const hasStatusChange =
    !!selectedTask &&
    !!initialTaskSnapshot &&
    selectedTask.status !== initialTaskSnapshot.status;
  const hasNotesChange =
    !!selectedTask &&
    typeof notesDraft === 'string' &&
    (selectedTask.notes || '') !== notesDraft;
  const hasPendingChanges =
    hasNewComment || hasMarkedAttachments || hasStatusChange || hasNotesChange;


  return (
    <PageScaffold
      pageTitle="Employee Tasks"
      stickyHeader={
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            pl: 3,
            pr: 1.5,
            pt: 2,
            pb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', mr: 2 }}>
              <Typography
                variant="body2"
                onClick={() => setViewMode('notifications')}
                sx={{
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontSize: 13,
                  letterSpacing: 0.6,
                  mr: 2,
                  pb: 0.75,
                  borderBottom:
                    viewMode === 'notifications' ? '2px solid #1E6F68' : '2px solid transparent',
                  color: viewMode === 'notifications' ? '#1E6F68' : 'text.primary',
                  fontWeight: viewMode === 'notifications' ? 600 : 400,
                }}
              >
                {`Notifications${viewMode === 'notifications' ? ` (${rows.length})` : ''}`}
              </Typography>
              <Divider
                orientation="vertical"
                flexItem
                sx={{ borderColor: '#d0d0d0', mr: 2 }}
              />
              <Typography
                variant="body2"
                onClick={() => setViewMode('my')}
                sx={{
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontSize: 13,
                  letterSpacing: 0.6,
                  mr: 2,
                  pb: 0.75,
                  borderBottom: viewMode === 'my' ? '2px solid #1E6F68' : '2px solid transparent',
                  color: viewMode === 'my' ? '#1E6F68' : 'text.primary',
                  fontWeight: viewMode === 'my' ? 600 : 400,
                }}
              >
                {`My tasks${viewMode === 'my' ? ` (${rows.length})` : ''}`}
              </Typography>
              <Divider
                orientation="vertical"
                flexItem
                sx={{ borderColor: '#d0d0d0', mr: 2 }}
              />
              <Typography
                variant="body2"
                onClick={() => setViewMode('all')}
                sx={{
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontSize: 13,
                  letterSpacing: 0.6,
                  mr: 0,
                  pb: 0.75,
                  borderBottom: viewMode === 'all' ? '2px solid #1E6F68' : '2px solid transparent',
                  color: viewMode === 'all' ? '#1E6F68' : 'text.primary',
                  fontWeight: viewMode === 'all' ? 600 : 400,
                }}
              >
                {`All tasks${viewMode === 'all' ? ` (${rows.length})` : ''}`}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              onClick={handleAddTask}
            >
              + Add
            </Button>
          </Box>

          <Box
            sx={{
              pb: 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            

            {statusFilter && (
              <Chip
                label={`Status: ${STATUS_LABELS[statusFilter] || statusFilter}`}
                size="small"
                onDelete={() => handleStatusFilterChange('')}
              />
            )}
          </Box>
        </Box>
      }
    >
      <TablePageHeader title="Tasks" />

      <Box sx={{ mt: 2 }}>
        <TableLite
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          getRowId={(row) => row.id}
          onRowClick={handleRowClick}
          enableFilters
          optionsSourceRows={rows}
        />
      </Box>
      {selectedTask && !previewImageUrl && (
        <AppDrawer
          open={Boolean(selectedTask)}
          title={selectedTask.title || 'Task details'}
          onClose={handleCloseDrawer}
        >
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box
              sx={{
                borderRadius: 1,
                border: '1px solid #eeeeee',
                backgroundColor: '#fafafa',
                p: 1.5,
                display: 'grid',
                rowGap: 0.5,
              }}
            >
              {/* Row 1: Assigned + Unit */}
              <Typography variant="body2">
                <strong>Assigned:</strong>{' '}
                {selectedTask.employee?.shortName || '—'}{' '}
                {selectedTask.employee?.division && (
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 0.5 }}
                  >
                    ({selectedTask.employee.division})
                  </Typography>
                )}
              </Typography>

              <Typography variant="body2">
                <strong>Unit:</strong>{' '}
                {selectedTask.unit?.unitName || '—'}
                {selectedTask.unit?.city && (
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 0.5 }}
                  >
                    — {selectedTask.unit.city}
                  </Typography>
                )}
              </Typography>


              {/* Row 3: Dates */}
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <strong>Created:</strong>{' '}
                {formatDateCancun(selectedTask.createdAt)}
                {'  '}•{'  '}
                <strong>Due:</strong>{' '}
                {formatDateCancun(selectedTask.dueDate)}
              </Typography>

              {/* Row 4: Last updated */}
              <Typography variant="body2" color="text.secondary">
                {selectedTask.updatedAt ? (
                  <>
                    <strong>Updated:</strong>{' '}
                    {selectedTask.updatedBy?.shortName || '—'}{' '}
                    {formatDateCancun(selectedTask.updatedAt)}
                    {' ; '}
                    {formatTimeCancun(selectedTask.updatedAt)}
                  </>
                ) : (
                  <>
                    <strong>Updated:</strong> —
                  </>
                )}
              </Typography>
            </Box>

            {/* Status and Priority summary */}
            <Box
              sx={{
                mt: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                rowGap: 0.5,
                columnGap: 1,
              }}
            >
              <TextField
                select
                label="Status"
                size="small"
                value={selectedTask.status || 'open'}
                onChange={(e) => handleStatusChange(e.target.value)}
                SelectProps={{
                  renderValue: (value) =>
                    STATUS_LABELS[value] || value || '—',
                }}
                sx={{
                  minWidth: 120,
                  maxWidth: 140,
                  '& .MuiSelect-select': {
                    color:
                      STATUS_TEXT_COLOR_MAP[selectedTask.status || 'open'] ||
                      'text.secondary',
                    fontWeight:
                      selectedTask.status === 'completed' ||
                      selectedTask.status === 'reviewed'
                        ? 600
                        : 500,
                  },
                }}
              >
                {STATUS_DROPDOWN_OPTIONS.map((key) => (
                  <MenuItem
                    key={key}
                    value={key}
                    sx={{
                      color: STATUS_TEXT_COLOR_MAP[key] || 'text.secondary',
                      fontWeight:
                        key === 'completed' || key === 'reviewed' ? 600 : 500,
                    }}
                  >
                    {STATUS_LABELS[key]}
                  </MenuItem>
                ))}
              </TextField>

              <Typography variant="body2">
                <strong>Priority:</strong>{' '}
                <Box
                  component="span"
                  sx={{
                    color:
                      PRIORITY_TEXT_COLOR_MAP[selectedTask.priority || 'normal'] ||
                      'text.secondary',
                  }}
                >
                  {PRIORITY_LABELS[selectedTask.priority || 'normal'] ||
                    selectedTask.priority ||
                    '—'}
                </Box>
              </Typography>
            </Box>

            {/* Notes */}
            <Box sx={{ mt: 1 }}>
              <TextField
                label="Notes"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                size="small"
                fullWidth
                multiline
                minRows={2}
              />
            </Box>

            {Array.isArray(selectedTask.attachments) &&
              selectedTask.attachments.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography
                    variant="subtitle2"
                    color="text.secondary"
                    sx={{ mb: 1 }}
                  >
                    Attachments
                  </Typography>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 75px)',
                      gap: 1,
                    }}
                  >
                    {selectedTask.attachments.map((att) => {
                      const url = att.url || '';
                      const isImage =
                        typeof url === 'string' &&
                        /\.(jpe?g|png|gif|webp)$/i.test(url.split('?')[0]);

                      const isSelected = attachmentsToDelete.includes(att.id);

                      return (
                        <Box
                          key={att.id}
                          sx={{
                            position: 'relative',
                            borderRadius: 1,
                            overflow: 'hidden',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fafafa',
                          }}
                        >
                          {isImage ? (
                            <Box
                              onClick={() => setPreviewImageUrl(url)}
                              sx={{
                                cursor: 'pointer',
                              }}
                            >
                              <Box
                                component="img"
                                src={url}
                                alt={att.fileName || 'Attachment'}
                                sx={{
                                  width: '100%',
                                  height: 75,
                                  objectFit: 'cover',
                                  display: 'block',
                                }}
                              />
                            </Box>
                          ) : (
                            <Box
                              sx={{
                                height: 120,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                px: 1,
                              }}
                            >
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                  textAlign: 'center',
                                  wordBreak: 'break-all',
                                }}
                              >
                                {att.fileName || att.url || 'Attachment'}
                              </Typography>
                            </Box>
                          )}

                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              px: 0.5,
                              py: 0.25,
                              borderTop: '1px solid #e0e0e0',
                              backgroundColor: '#ffffff',
                            }}
                          >
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleAttachmentSelection(att.id);
                              }}
                              sx={{
                                color: isSelected ? 'error.main' : 'text.secondary',
                              }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                            {url && (
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadAttachment(url, att.fileName);
                                }}
                                sx={{
                                  color: 'text.secondary',
                                }}
                              >
                                <DownloadOutlinedIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>

                </Box>
              )}

            <Divider />

            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Comments
              </Typography>

              {commentsLoading && (
                <Typography variant="body2" color="text.secondary">
                  Loading comments...
                </Typography>
              )}

              {commentsError && (
                <Typography variant="body2" color="error">
                  {commentsError}
                </Typography>
              )}

              {!commentsLoading && !commentsError && comments.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No comments yet.
                </Typography>
              )}

              {!commentsLoading && !commentsError && comments.length > 0 && (
                <Box
                  sx={{
                    mt: 1,
                    borderRadius: 1,
                    border: '1px solid #eeeeee',
                    backgroundColor: '#fafafa',
                    maxHeight: 260,
                    overflowY: 'auto',
                    p: 1.25,
                  }}
                >
                  <Stack spacing={1.25}>
                  {[...comments].reverse().map((c, idx, reversed) => {
                      const authorName =
                        c.author?.shortName ||
                        c.employee?.shortName ||
                        selectedTask?.createdBy?.shortName ||
                        'Comment';

                      let createdLabel = '';
                      if (c.createdAt) {
                        createdLabel = formatDateTimeCancun(c.createdAt);
                      }

                      return (
                        <Box
                          key={c.id}
                          sx={{
                            pb: 0.75,
                            '&:last-of-type': {
                              pb: 0,
                            },
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'baseline',
                              justifyContent: 'space-between',
                              mb: 0.25,
                              gap: 1,
                            }}
                          >
                            <Typography variant="body2" fontWeight={600}>
                              {authorName}
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
                            {c.message || c.comment || ''}
                          </Typography>
                          {idx < reversed.length - 1 && (
                            <Box
                              sx={{
                                mt: 0.5,
                                borderBottom: '1px solid #e0e0e0',
                                maxWidth: '40%',
                                mx: 'auto',
                              }}
                            />
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              {/* New comment box */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Add comment
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={4}
                  size="small"
                  placeholder="Write a comment or update..."
                  value={newComment}
                  onChange={(e) => {
                    setNewComment(e.target.value);
                    if (commentsError) {
                      setCommentsError(null);
                    }
                  }}
                />
                <Box
                  sx={{
                    mt: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleAddComment}
                      disabled={commentSubmitting || !hasPendingChanges}
                    >
                      {commentSubmitting ? 'Saving...' : 'Save'}
                    </Button>

                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleCloseDrawer}
                    >
                      Cancel
                    </Button>
                  </Box>

                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={async () => {
                      if (!selectedTask?.id) return;
                      try {
                        await api.delete(`/api/employee-tasks/${selectedTask.id}`);
                        await loadTasks();
                        setSelectedTask(null);
                      } catch (e) {
                        console.error('Failed to delete task', e);
                      }
                    }}
                  >
                    Delete Task
                  </Button>
                </Box>
              </Box>
            </Box>
          </Box>
        </AppDrawer>
      )}
      {previewImageUrl && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: (theme) => theme.zIndex.modal + 1,
            bgcolor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setPreviewImageUrl(null)}
        >
          <Box
            sx={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              size="small"
              onClick={() => setPreviewImageUrl(null)}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                color: '#ffffff',
                bgcolor: 'rgba(0,0,0,0.4)',
                '&:hover': {
                  bgcolor: 'rgba(0,0,0,0.6)',
                },
              }}
            >
              <CloseIcon />
            </IconButton>
            <Box
              component="img"
              src={previewImageUrl}
              alt="Attachment preview"
              sx={{
                maxWidth: '100%',
                maxHeight: '100%',
                display: 'block',
                borderRadius: 1,
                boxShadow: 4,
              }}
            />
          </Box>
        </Box>
      )}
      {createOpen && (
        <AppDrawer
          open={createOpen}
          title="New task"
          onClose={() => setCreateOpen(false)}
          showActions
          formId="employee-task-form"
        >
          <Box sx={{ p: 2 }}>
            {formOptionsLoading && (
              <Typography variant="body2" color="text.secondary">
                Loading form...
              </Typography>
            )}
            {formOptionsError && (
              <Typography variant="body2" color="error">
                {formOptionsError}
              </Typography>
            )}
            {!formOptionsLoading && !formOptionsError && (
              <EmployeeTasksFormRHF
                formId="employee-task-form"
                hideActions
                employees={formOptions.employees}
                units={formOptions.units}
                loading={createSubmitting}
                onSubmit={handleCreateTaskSubmit}
              />
            )}
          </Box>
        </AppDrawer>
      )}
    </PageScaffold>
  );
};

// If we arrived here with a specific task to open (e.g. from Dashboard notifications),
// fetch the task and open the drawer.
// (Moved inside EmployeeTasks component body)

export default EmployeeTasks;