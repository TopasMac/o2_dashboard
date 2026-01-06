import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardContent,
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  Divider,
  Tooltip,
  IconButton,
} from '@mui/material';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FiberNewOutlinedIcon from '@mui/icons-material/FiberNewOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import { formatDateCancun, formatDateTimeCancun } from '../../utils/dateTimeCancun';

const viewOptions = {
  employee: [
    { key: 'notifications' },
    { key: 'my' },
    { key: 'maintenance' },
  ],
  supervisor: [
    { key: 'notifications' },
    { key: 'my' },
    { key: 'maintenance' },
  ],
  manager: [
    { key: 'notifications' },
    { key: 'my' },
    { key: 'assigned_by_me' },
    { key: 'maintenance' },
  ],
};

const typeLabels = {
  new: 'New',
  overdue: 'Overdue',
  status: 'Status update',
  comment: 'New comment',
};

function TaskNotificationsCard({
  title,
  items,
  loading = false,
  mode = 'employee',
  variant = 'desktop',
  view,
  onChangeView,
  onOpenTask,
  onDismiss,
  onStartTask,
  maxItems = 5,
}) {
  const { t } = useTranslation();
  const modeViews = viewOptions[mode] || viewOptions.employee;
  const defaultViewKey = modeViews[0]?.key || 'notifications';

  const isMobile = variant === 'mobile';

  // Internal view state, can be overridden by external `view` prop
  const [internalView, setInternalView] = useState(view || defaultViewKey);
  const activeView = view || internalView;

  const isMyView = activeView === 'my';

  const isMaintenanceView = activeView === 'maintenance';

  const maintenanceTitles = new Set(['Mantenimiento Preventivo', 'Mantenimiento AC']);
  const isMaintenanceTask = (it) => {
    const t0 = it && typeof it.title === 'string' ? it.title.trim() : '';
    return maintenanceTitles.has(t0);
  };

  const allItems = items || [];

  // UI rule: maintenance tasks should only appear in the Maintenance tab.
  // - In Maintenance view: show only maintenance tasks.
  // - In My view: hide maintenance tasks.
  // - Other views (notifications / assigned_by_me): keep as-is (backend decides notification eligibility).
  const displayedItems = isMaintenanceView
    ? allItems.filter(isMaintenanceTask)
    : (isMyView ? allItems.filter((it) => !isMaintenanceTask(it)) : allItems);

  const itemCount = displayedItems.length;

  const handleViewChange = (viewKey) => {
    setInternalView(viewKey);
    if (onChangeView) {
      onChangeView(viewKey);
    }
  };

  const handleOpenTask = (item) => {
    if (onOpenTask) {
      onOpenTask(item);
    }
  };

  return (
    <Card>
      <Box
        sx={{
          backgroundColor: '#1E6F68',
          color: 'white',
          px: isMobile ? 1.5 : 2,
          py: isMobile ? 0.75 : 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
        }}
      >
        <Typography variant="subtitle1" fontWeight="bold" component="div" noWrap>
          {title || t('tasks.title')}
        </Typography>
        <Typography
          variant="caption"
          sx={{ opacity: 0.7, minWidth: isMobile ? 52 : 60, textAlign: 'right' }}
          component="div"
          noWrap
        >
          {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'No items'}
        </Typography>
      </Box>

      <Box
        sx={{
          px: isMobile ? 1.25 : 1.5,
          pt: 0.5,
          pb: 0,
          display: 'flex',
          gap: isMobile ? 1 : 1.5,
          flexWrap: 'nowrap',
          userSelect: 'none',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {modeViews.map((opt) => {
          const isActive = activeView === opt.key;
          return (
            <Button
              key={opt.key}
              size="small"
              variant="text"
              onClick={() => handleViewChange(opt.key)}
              sx={{
                textTransform: 'none',
                px: 0,
                py: 0.5,
                fontSize: 13,
                minWidth: 'auto',
                borderRadius: 0,
                alignItems: 'flex-end',
                color: isActive ? '#1E6F68' : 'text.secondary',
                fontWeight: isActive ? 600 : 400,
                borderBottom: isActive ? '2px solid #1E6F68' : '2px solid transparent',
                '&:hover': {
                  backgroundColor: 'transparent',
                  color: '#1E6F68',
                },
              }}
            >
              {t(`tasks.views.${opt.key}`)}
            </Button>
          );
        })}
      </Box>

      <CardContent sx={{ p: isMobile ? 1.25 : 1.5, pt: 0.5, pb: 0 }}>
        <Box
          sx={{
            maxHeight: isMobile ? 270 : 260,
            overflowY: 'auto',
          }}
        >
          {loading ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
              Loading tasks...
            </Typography>
          ) : !items || items.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
              No new notifications
            </Typography>
          ) : (
            displayedItems.map((item, index) => {
              const {
                id,
                title: itemTitle,
                subtitle,
                type,
                dueDate,
                status,
                assignedToLabel,
                oldStatus,
                newStatus,
                createdAt,
                updatedAt,
                dueStatus,
                lastComment,
                attachments,
                hasAttachments,
                unitName,
                description,
                notes,
                isMaintenance,
                maintenanceLastDoneAt,
              } = item;

              const hasComment = !!lastComment;
              const hasAttachmentIcon = Array.isArray(attachments)
                ? attachments.length > 0
                : !!hasAttachments;

              // Treat tasks as "new" until the user opens them (status changes from open -> in_progress).
              // Exclude maintenance tasks here because they have their own tab/rules.
              const isNewUntilOpened = status === 'open' && !lastComment && !isMaintenanceTask(item);

              // For "My tasks" second row: unitName • description.
              // If description is empty, we fall back to a simple subtitle that does
              // not look like the auto-generated "New • Due ... • Assigned to you"
              // (those contain bullet separators).
              let descriptionText = '';
              if (typeof description === 'string' && description.trim().length > 0) {
                descriptionText = description.trim();
              } else if (typeof subtitle === 'string') {
                const trimmedSubtitle = subtitle.trim();
                // Use subtitle only if it doesn't contain bullet separators (•),
                // which we treat as a sign of an auto-generated meta subtitle.
                if (trimmedSubtitle && !trimmedSubtitle.includes('•')) {
                  descriptionText = trimmedSubtitle;
                }
              }
              const unitLabel = unitName || '';
              const notificationsTitle = unitLabel ? `${unitLabel} • ${itemTitle}` : itemTitle;

              const detailParts = [];
              if (unitName) {
                detailParts.push(unitName);
              }
              if (descriptionText) {
                detailParts.push(descriptionText);
              }
              const detailText = detailParts.length > 0 ? detailParts.join(' \u2022 ') : '';

              // Created date short (use Cancun helper)
              let createdShort = null;
              if (createdAt) {
                createdShort = formatDateCancun(createdAt);
              }
              let createdDmy = null;
              if (createdShort && createdShort !== '—') {
                const p = createdShort.split('/');
                if (p.length === 3) {
                  const yy = String(p[2]).slice(-2);
                  createdDmy = `${p[0]}-${p[1]}-${yy}`;
                }
              }

              // Top-row extra info (after title): due date + status
              let dueShort = null;
              let dueDmy = null;
              if (dueDate) {
                const full = formatDateCancun(dueDate); // e.g. DD/MM/YYYY
                if (full && full !== '—') {
                  const parts = full.split('/');
                  if (parts.length >= 2) {
                    dueShort = `${parts[0]}/${parts[1]}`; // DD/MM
                  } else {
                    dueShort = full;
                  }
                  if (parts.length === 3) {
                    const yy = String(parts[2]).slice(-2);
                    dueDmy = `${parts[0]}-${parts[1]}-${yy}`;
                  }
                }
              }

              let updatedShort = null;
              if (updatedAt) {
                updatedShort = formatDateTimeCancun(updatedAt);
              }

              // Updated date short (DD/MM) for "My tasks" bottom row (date only)
              let updatedDateShort = null;
              if (updatedAt) {
                const fullUpd = formatDateCancun(updatedAt); // DD/MM/YYYY or '—'
                if (fullUpd && fullUpd !== '—') {
                  const upParts = fullUpd.split('/');
                  if (upParts.length >= 2) {
                    updatedDateShort = `${upParts[0]}/${upParts[1]}`; // DD/MM
                  } else {
                    updatedDateShort = fullUpd;
                  }
                }
              }

              const statusMap = {
                open: 'New',
                in_progress: 'Ongoing',
                needs_help: 'Help',
                reviewed: 'Checked',
                completed: 'Done',
                archived: 'Archived',
              };

              const statusColorMap = {
                open: '#9E9E9E',        // New - grey
                in_progress: '#1E88E5', // Ongoing - blue
                needs_help: '#FFC107',  // Help - yellow/amber
                reviewed: '#9C27B0',    // Checked - purple
                completed: '#1E6F68',   // Done - teal (Owners2)
                archived: '#B0BEC5',    // Archived - light grey
              };

              const statusLabel = statusMap[status] || null;
              const statusColor = statusColorMap[status] || null;

              const dueStatusColorMap = {
                close_to_overdue: '#FFC107', // amber
                overdue: '#E53935',          // red
              };

              const dueStatusColor = dueStatus ? dueStatusColorMap[dueStatus] || null : null;

              // Top-row extra info (after title) – only for non "My tasks" views
              const topInfoParts = [];
              if (!isMyView) {
                // In Notifications / other views, keep: due_date • status
                if (dueShort) {
                  topInfoParts.push(dueShort);
                }
                if (statusLabel) {
                  topInfoParts.push(statusLabel);
                }
              }
              const topInfoText = topInfoParts.join(' • ');

              // Maintenance last-done date (dd-mm-yy)
              let doneDmy = null;
              if (maintenanceLastDoneAt) {
                const doneShort = formatDateCancun(maintenanceLastDoneAt);
                if (doneShort && doneShort !== '—') {
                  const p = doneShort.split('/');
                  if (p.length === 3) {
                    const yy = String(p[2]).slice(-2);
                    doneDmy = `${p[0]}-${p[1]}-${yy}`;
                  }
                }
              }

              const isAdminLike = mode === 'manager' || mode === 'admin';
              const isCompletedMaintenanceNotice = !!isMaintenance && status === 'completed' && !isMaintenanceView && !isMyView && isAdminLike;

              // Bottom-row info for non "My tasks" views:
              let bottomText = '';
              if (!isMyView) {
                if (isMaintenanceView) {
                  bottomText = `Fecha Programada: ${dueDmy || '-'}`;
                } else if (isNewUntilOpened) {
                  const bottomParts = [];
                  bottomParts.push(`Creado: ${createdDmy || '-'}`);
                  bottomParts.push(`Due: ${dueDmy || '-'}`);
                  bottomText = bottomParts.join(' • ');
                } else if (isCompletedMaintenanceNotice) {
                  const noteText = typeof notes === 'string' ? notes.trim() : '';
                  bottomText = noteText
                    ? `Realizado: ${doneDmy || '-'} • Nota: ${noteText}`
                    : `Realizado: ${doneDmy || '-'}`;
                } else if (descriptionText) {
                  // For Notifications, use description as the bottom row when available.
                  bottomText = descriptionText;
                } else {
                  const bottomParts = [];

                  if (type === 'comment') {
                    const commentContent =
                      (lastComment && lastComment.content) || subtitle || '';
                    const commentAuthor =
                      lastComment && lastComment.authorShortName
                        ? lastComment.authorShortName
                        : null;

                    if (commentContent) {
                      if (commentAuthor) {
                        bottomParts.push(`${commentAuthor}: ${commentContent}`);
                      } else {
                        bottomParts.push(commentContent);
                      }
                    }
                  } else {
                    if (dueStatus === 'overdue') {
                      bottomParts.push('Overdue');
                    }
                    if (type === 'overdue') {
                      bottomParts.push('Overdue');
                    } else if (type === 'status') {
                      bottomParts.push('Status update');
                    }

                    if (subtitle) {
                      bottomParts.push(subtitle);
                    }

                    if (!subtitle && assignedToLabel) {
                      bottomParts.push(
                        assignedToLabel.toLowerCase() === 'you'
                          ? 'Assigned to you'
                          : `Assigned to ${assignedToLabel}`
                      );
                    }
                  }

                  bottomText = bottomParts.join(' • ');
                }
              }

              return (
                <Box key={id} sx={{}}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      py: 0.5,
                      px: 1,
                    }}
                    onClick={() => {
                      if (onOpenTask) {
                        handleOpenTask(item);
                      }
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Tooltip title={itemTitle}>
                        {isMyView ? (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'baseline',
                              justifyContent: 'space-between',
                              gap: 1,
                              minWidth: 0,
                            }}
                          >
                            <Typography
                              variant="body2"
                              fontWeight="medium"
                              sx={{
                                cursor: onOpenTask ? 'pointer' : 'default',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flexGrow: 1,
                              }}
                              onClick={() => onOpenTask && handleOpenTask(item)}
                            >
                              {itemTitle}
                            </Typography>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                flexShrink: 0,
                              }}
                            >
                              {hasComment && (
                                <ChatBubbleOutlineOutlinedIcon
                                  sx={{ fontSize: 14, color: 'text.secondary' }}
                                />
                              )}
                              {hasAttachmentIcon && (
                                <AttachFileOutlinedIcon
                                  sx={{ fontSize: 16, color: 'text.secondary' }}
                                />
                              )}
                              {statusLabel && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    textAlign: 'right',
                                    ...(statusColor ? { color: statusColor } : {}),
                                  }}
                                >
                                  {statusLabel}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        ) : (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'baseline',
                              gap: 0.5,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                            }}
                          >
                            <Typography
                              variant="body2"
                              fontWeight="medium"
                              sx={{
                                cursor: onOpenTask ? 'pointer' : 'default',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              onClick={() => onOpenTask && handleOpenTask(item)}
                            >
                              {notificationsTitle}
                            </Typography>
                          </Box>
                        )}
                      </Tooltip>
                      {isMyView ? (
                        <Box
                          sx={{
                            mt: 0.25,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                          }}
                        >
                          {detailText && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              noWrap
                            >
                              {detailText}
                            </Typography>
                          )}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              flexShrink: 0,
                              textAlign: 'right',
                              marginLeft: detailText ? 0 : 'auto',
                            }}
                            noWrap
                          >
                            <Box
                              component="span"
                              sx={
                                dueStatusColor
                                  ? {
                                      color: dueStatusColor,
                                      fontWeight: 500,
                                    }
                                  : {}
                              }
                            >
                              {`Due: ${dueShort || '-'}`}
                            </Box>
                          </Typography>
                        </Box>
                      ) : (
                        bottomText && (
                          <Box
                            sx={{
                              mt: 0.25,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                            }}
                          >
                            {type === 'comment' && (
                              <ChatBubbleOutlineOutlinedIcon
                                sx={{ fontSize: 14, flexShrink: 0 }}
                              />
                            )}
                            {isNewUntilOpened && (
                              <FiberNewOutlinedIcon
                                sx={{ fontSize: 25, flexShrink: 0, color: '#1E6F68' }}
                              />
                            )}
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              noWrap
                            >
                              {isMaintenanceView ? (
                                <>
                                  <Box component="span">Fecha Programada: </Box>
                                  <Box
                                    component="span"
                                    sx={
                                      dueStatusColor
                                        ? { color: dueStatusColor, fontWeight: 600 }
                                        : { fontWeight: 600 }
                                    }
                                  >
                                    {dueDmy || '-'}
                                  </Box>
                                </>
                              ) : (
                                bottomText
                              )}
                            </Typography>
                          </Box>
                        )
                      )}
                      {type === 'status' && oldStatus && newStatus && !isCompletedMaintenanceNotice && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            mt: 0.25,
                            ml: 1,
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          noWrap
                        >
                          Status: {oldStatus} → {newStatus}
                        </Typography>
                      )}
                    </Box>
                    {!isMyView && (
                      <Box sx={{ ml: 1, flexShrink: 0 }}>
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (onStartTask) {
                              onStartTask(item);
                            } else if (onOpenTask) {
                              handleOpenTask(item);
                            }
                          }}
                          sx={{ p: 0.5 }}
                        >
                          <CheckCircleOutlineIcon sx={{ fontSize: 20, color: '#1E6F68' }} />
                        </IconButton>
                      </Box>
                    )}
                  </Box>
                  {index !== displayedItems.length - 1 && (
                    <Divider component="hr" variant="fullWidth" sx={{ mx: 1 }} />
                  )}
                </Box>
              );
            })
          )}
        </Box>
      </CardContent>

      <Box
        sx={{
          px: isMobile ? 1.5 : 2,
          py: isMobile ? 0.75 : 1,
          display: 'flex',
          justifyContent: 'flex-end',
          borderTop: '1px solid',
          borderColor: 'divider',
          userSelect: 'none',
        }}
      >
        {onOpenTask ? (
          <Button
            size="small"
            variant="text"
            onClick={() => onOpenTask(null)}
            sx={{ textTransform: 'none' }}
          >
            View all tasks
          </Button>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ pt: 0.5, userSelect: 'none' }}
          >
            View all tasks
          </Typography>
        )}
      </Box>
    </Card>
  );
}

export default TaskNotificationsCard;
