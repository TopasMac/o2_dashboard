const SERVICE_LABELS = {
  CFE: 'CFE',
  HOA: 'HOA',
  Internet: 'Internet',
  Water: 'Agua',
};

function parseYmd(ymd) {
  const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function getDueDate(alert) {
  const match = String(alert?.yearMonth || '').match(/^(\d{4})-(\d{2})$/);
  const deadline = Number(alert?.deadline);
  if (!match || !Number.isInteger(deadline) || deadline < 1 || deadline > 31) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(deadline, lastDay)));
}

function formatDueDate(date) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date).replace('.', '').toLowerCase();
}

export function buildMobileServiceAlerts(alerts, todayYmd, futureDays = 7) {
  const today = parseYmd(todayYmd);
  if (!today) return [];
  const dayMs = 24 * 60 * 60 * 1000;

  return (Array.isArray(alerts) ? alerts : [])
    .filter((alert) => ['service-payment-overdue', 'service-payment-due-soon'].includes(alert?.type))
    .map((alert) => {
      const dueDate = getDueDate(alert);
      if (!dueDate) return null;
      const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / dayMs);
      if (daysUntil > futureDays) return null;

      let deadlineState = 'later';
      let priority = 3;
      if (daysUntil < 0) {
        deadlineState = 'overdue';
        priority = 0;
      } else if (daysUntil === 0) {
        deadlineState = 'today';
        priority = 1;
      } else if (daysUntil === 1) {
        deadlineState = 'tomorrow';
        priority = 2;
      }

      const service = SERVICE_LABELS[alert.service] || alert.service || 'Servicio';
      const reference = String(alert.serviceReference || '').trim();
      const provider = String(alert.serviceProvider || '').trim();
      const detail = alert.service === 'Internet'
        ? [provider, reference].filter(Boolean).join(': ')
        : (reference ? `Referencia: ${reference}` : '');

      return {
        ...alert,
        service,
        dueDate: dueDate.toISOString().slice(0, 10),
        daysUntil,
        deadlineState,
        deadlineLabel: daysUntil === 0 ? 'Hoy' : formatDueDate(dueDate),
        detail,
        priority,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (
      a.priority - b.priority
      || a.dueDate.localeCompare(b.dueDate)
      || String(a.service).localeCompare(String(b.service), 'es', { sensitivity: 'base' })
      || String(a.unitName || '').localeCompare(String(b.unitName || ''), 'es', { sensitivity: 'base' })
    ));
}
