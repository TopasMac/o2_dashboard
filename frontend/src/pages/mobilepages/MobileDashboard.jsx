import * as React from 'react';
import Box from '@mui/material/Box';
import TaskNotificationsCard from '../../components/cards/TaskNotificationsCard.jsx';
import api from '../../api.js';
import useCurrentUserAccess from '../../hooks/useCurrentUserAccess.js';
import { useNavigate } from 'react-router-dom';

/**
 * MobileDashboard
 * -----------------------------------------------------------------------------
 * A compact, scroll-friendly dashboard for mobile.
 * Shows a task notifications card based on user session and permissions.
 */
export default function MobileDashboard() {
  const access = useCurrentUserAccess();
  const navigate = useNavigate();
  const { permissions, employee, isLoading: sessionLoading } = access;

  const [tasks, setTasks] = React.useState([]);
  const [tasksLoading, setTasksLoading] = React.useState(true);
  const [activeView, setActiveView] = React.useState('notifications');

  const canViewTasks =
    permissions.includes('tasks.view_self') ||
    permissions.includes('tasks.view_team') ||
    permissions.includes('tasks.view_all');

  const taskMode = React.useMemo(() => {
    const areaRaw = employee?.area || '';
    const area = areaRaw.toString().trim().toUpperCase();

    if (area === 'MANAGER' || area === 'ADMIN') {
      return 'manager';
    }
    if (area === 'SUPERVISOR') {
      return 'supervisor';
    }
    return 'employee';
  }, [employee]);

  React.useEffect(() => {
    if (!canViewTasks || sessionLoading) return;
    let isMounted = true;

    const loadTasks = async () => {
      try {
        setTasksLoading(true);
        const response = await api.get('/api/employee-tasks/notifications', {
          params: { view: activeView },
        });
        if (!isMounted) return;

        const payload = response.data;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setTasks(items);
      } catch (e) {
        if (!isMounted) return;
        setTasks([]);
      } finally {
        if (isMounted) {
          setTasksLoading(false);
        }
      }
    };

    loadTasks();
    return () => {
      isMounted = false;
    };
  }, [canViewTasks, sessionLoading, activeView]);

  const handleStartTask = React.useCallback(
    async (item) => {
      if (!item || !item.id || !canViewTasks || sessionLoading) {
        return;
      }

      try {
        setTasksLoading(true);

        // 1) Ack + move task to in_progress
        await api.post(`/api/employee-tasks/${item.id}/ack`);

        // 2) Reload tasks for the current view (stay on Notifications or My Tasks)
        const response = await api.get('/api/employee-tasks/notifications', {
          params: { view: activeView },
        });

        const payload = response.data;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setTasks(items);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error starting task from MobileDashboard:', e);
      } finally {
        setTasksLoading(false);
      }
    },
    [canViewTasks, sessionLoading, activeView]
  );

  const handleOpenTask = React.useCallback(
    async (item) => {
      if (!item || !item.id) return;

      try {
        // When opening from the Notifications tab, also dismiss the notification
        // so that simply viewing the task counts as "seen", even if the user
        // later cancels out of the edit form.
        if (activeView === 'notifications' && canViewTasks && !sessionLoading) {
          await api.post(`/api/employee-tasks/${item.id}/ack`);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error acknowledging task from MobileDashboard:', e);
      }

      navigate(`/m/tasks/${item.id}`);
    },
    [navigate, activeView, canViewTasks, sessionLoading]
  );

  return (
    <Box sx={{ flexGrow: 1, p: 1.5 }}>
      {sessionLoading && (
        <Box sx={{ fontSize: 14, color: 'text.secondary' }}>Cargando…</Box>
      )}

      {!sessionLoading && canViewTasks && (
        <TaskNotificationsCard
          title="Mis tareas"
          items={tasks}
          loading={tasksLoading}
          mode={taskMode}
          variant="mobile"
          maxItems={5}
          view={activeView}
          onChangeView={setActiveView}
          onStartTask={handleStartTask}
          onOpenTask={handleOpenTask}
        />
      )}

      {!sessionLoading && !canViewTasks && (
        <Box sx={{ fontSize: 14, color: 'text.secondary' }}>
          No tienes módulos habilitados en el dashboard móvil.
        </Box>
      )}
    </Box>
  );
}
