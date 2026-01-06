import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Owners2 i18n bootstrap
 *
 * Goals:
 * - Default to Spanish (es)
 * - Allow runtime switching via i18n.changeLanguage(lang)
 * - Later: override language based on /api/session/me (employee => es, client => client.language)
 *
 * Notes:
 * - Keep resources small at first; grow page-by-page.
 * - Use a single namespace ("common") for now.
 */

const STORAGE_KEY = 'o2_lang';

function getInitialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {}
  return 'es';
}

const resources = {
  es: {
    common: {
      // Generic
      'common.loading': 'Cargando…',
      'common.save': 'Guardar',
      'common.cancel': 'Cancelar',
      'common.close': 'Cerrar',
      'common.open': 'Abrir',
      'common.copied': 'Copiado ✓',
      // Mobile titles
      'mobile.dashboard': 'Dashboard',
      'mobile.editTask': 'Editar tarea',
      'mobile.unitDetails': 'Detalles de unidad',
      'mobile.bookingsCalendar': 'Calendario',
      'mobile.searchBookings': 'Buscar reservas',
      'mobile.checkActivity': 'Salidas y Entradas',
      'mobile.cashLedger': 'Registro de Gastos',
      'mobile.newCashEntry': 'Nueva Transaccion',
      'mobile.editCashEntry': 'Editar Transaccion',
      'mobile.onboardingUnits': 'Alta de unidades',
      'mobile.unitInventory': 'Inventario',
      'mobile.reviewSubmit': 'Revisar y enviar',
      // Tasks
      'tasks.title': 'Tareas',
      'tasks.views.notifications': 'Notificaciones',
      'tasks.views.my': 'Mis tareas',
      'tasks.views.assigned_by_me': 'Asignadas por mi',
      'tasks.views.maintenance': 'Mantenimiento',
    },
  },
  en: {
    common: {
      // Generic
      'common.loading': 'Loading…',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.open': 'Open',
      'common.copied': 'Copied ✓',
      // Mobile titles
      'mobile.dashboard': 'Dashboard',
      'mobile.editTask': 'Edit Task',
      'mobile.unitDetails': 'Unit Details',
      'mobile.bookingsCalendar': 'Bookings Calendar',
      'mobile.searchBookings': 'Search Bookings',
      'mobile.checkActivity': 'Check Activity',
      'mobile.cashLedger': 'Cash Ledger',
      'mobile.newCashEntry': 'New Cash Entry',
      'mobile.editCashEntry': 'Edit Cash Entry',
      'mobile.onboardingUnits': 'Onboarding Units',
      'mobile.unitInventory': 'Unit Inventory',
      'mobile.reviewSubmit': 'Review & Submit',
      // Tasks
      'tasks.title': 'Tasks',
      'tasks.views.notifications': 'Notifications',
      'tasks.views.my': 'My tasks',
      'tasks.views.assigned_by_me': 'Assigned by me',
      'tasks.views.maintenance': 'Maintenance',
    },
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'es',
    defaultNS: 'common',
    ns: ['common'],
    interpolation: {
      escapeValue: false,
    },
    // Keep react-i18next from suspending (we don't use Suspense here)
    react: {
      useSuspense: false,
    },
  });

// Persist language when changed (clients later / manual override)
i18n.on('languageChanged', (lng) => {
  try {
    if (lng === 'en' || lng === 'es') {
      localStorage.setItem(STORAGE_KEY, lng);
    }
  } catch {}
});

export default i18n;
