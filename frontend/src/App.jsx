import { useEffect, useRef } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import Layout from './components/Layout';
import Employees from './pages/Employees';
import ServicesPaymentsV2 from './pages/ServicesPaymentsV2';
import UnitMonthlyReport from './pages/UnitMonthlyReport';
import AirbnbPayoutsRecon from './pages/AirbnbPayoutsRecon';
import Dashboard from './pages/Dashboard';
import SeeBookings from './pages/SeeBookings';
import Units from './pages/Units';
import UnitDetails from './pages/UnitDetails';
import UnitMedia from './pages/UnitMedia';
import EditClientForm from './components/forms/EditClientForm';
import UnitTransactionNewFormRHF from './components/forms/UnitTransactionNewFormRHF';
import EditUnitTransactionForm from './components/forms/UnitMonthlyReportPage/UnitMonthlyEditUnitTransactionForm';
import NewO2TransactionForm from './components/forms/NewO2TransactionForm';
import EditO2TransactionForm from './components/forms/EditO2TransactionForm';
import O2Transactions from './pages/O2Transactions';
import O2Results from './components/reports/O2Results';
import Condos from './pages/Condos';
import Clients from './pages/Clients';
import ClientForm from './components/forms/ClientForm';
import NewCondoForm from './components/forms/NewCondoForm';
import EditCondoForm from './components/forms/EditCondoForm';
import Owners2UnitTransactions from './pages/Owners2UnitTransactions';
import HKTransactions from './pages/HKTransactions';
import HRTransactions from './pages/HRTransactions';
import EmployeeCashAdmin from './pages/EmployeeCashAdmin';
import HKTransactionForm from './components/forms/HKTransactionForm';
import EditHKTransactionForm from './components/forms/EditHKTransactionForm';
import Reports from './pages/Reports';
import AccountingRecords from './pages/AccountingRecords';
import Occupancy from './pages/Occupancy';
import Login from './pages/Login';
import ManagerDashboard from './pages/ManagerDashboard';
import MobileBookingsSearch from './pages/mobilepages/MobileBookingsSearch';
import MobileUnitDetails from './pages/mobilepages/MobileUnitDetails';
import MobileDashboard from './pages/mobilepages/MobileDashboard';
import MobileBookingsCalendar from './pages/mobilepages/MobileBookingsCalendar';
import MobileShell from './pages/mobilepages/MobileShell';
import MobileInventoryNew from './pages/mobilepages/MobileInventoryNew';
import MobileCheckInOutView from './pages/mobilepages/MobileCheckInOutView';
import MobileInventoryForm from './pages/mobilepages/mobileForms/MobileInventoryForm';
import MobileInventoryReview from './pages/mobilepages/MobileInventoryReview';
import MobileEmployeeCash from './pages/mobilepages/MobileEmployeeCash';
import MobileCashForm from './pages/mobilepages/mobileForms/MobileCashForm';
import MobileCashEditForm from './pages/mobilepages/mobileForms/MobileCashEditForm';
import MobileTaskEditForm from './pages/mobilepages/mobileForms/MobileTaskEditForm';
import './styles/form.css';
import NewClientUnitNote from './components/forms/NewClientUnitNote';
import UnitBalance from './pages/UnitBalance';
import NewUnitLedgerForm from './components/forms/NewUnitLedgerForm';
import EditUnitLedgerForm from './components/forms/EditUnitLedgerForm';
import IconGallery from './components/dev/IconGallery';
import ReportComments from './pages/ReportComments';
import NewReportCommentForm from './components/forms/NewReportCommentForm';
import UnitContract from './pages/UnitContract';
import CheckInOutView from './pages/CheckInOutView';
import HKCleaningsView from './pages/HKCleaningsView';
import HKCleaningsRecon from './pages/HKCleaningsRecon';
import BookingsTimeline from './pages/BookingsTimeline';
import AirbnbCalTable from './pages/AirbnbCalTable';
import HKResults from './components/reports/HKResults';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import SocialPosts from './pages/SocialPosts';
import SocialCalendar from './pages/SocialCalendar';
import ShareLinkHandler from './pages/ShareLinkHandler';
import UnitInventoryPage from './pages/UnitInventory';
import EmployeeTasks from './pages/EmployeeTasks';

// --- Sticky mobile/desktop shell preference ---
function PreferredShellStickyRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const firstLoadRef = useRef(true);

  // Remember user's current shell on every path change
  useEffect(() => {
    const path = location.pathname || '';
    try {
      if (path === '/m' || path.startsWith('/m/')) {
        localStorage.setItem('o2_preferred_shell', 'mobile');
      } else if (path && path !== '/login') {
        // any non-/m and non-login path counts as desktop shell
        localStorage.setItem('o2_preferred_shell', 'desktop');
      }
    } catch {}
  }, [location.pathname]);

  // On first load only, if user prefers mobile shell and we're not on /m, jump to mobile dashboard
  useEffect(() => {
    if (!firstLoadRef.current) return;
    firstLoadRef.current = false;
    try {
      const pref = localStorage.getItem('o2_preferred_shell');
      const path = location.pathname || '';
      if (pref === 'mobile' && !path.startsWith('/m')) {
        navigate('/m/dashboard', { replace: true });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
// --- end sticky preference ---

// --- Role helpers & guard ---
function getToken() {
  try {
    return localStorage.getItem('token') || null;
  } catch {
    return null;
  }
}

function getUserRolesFromToken(token) {
  if (!token) return [];
  try {
    const parts = token.split('.');
    if (parts.length < 2) return [];
    // Base64URL decode payload
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(decodeURIComponent(escape(window.atob(base64))));
    const roles = json.roles || json.authorities || json.roles_claim || [];
    return Array.isArray(roles) ? roles : (typeof roles === 'string' ? [roles] : []);
  } catch {
    return [];
  }
}

function hasAnyRole(userRoles, allowedRoles) {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  const set = new Set((userRoles || []).map(String));
  return allowedRoles.some(r => set.has(String(r)));
}

// Guard that requires authentication + one of the allowed roles
function RoleRoute({ roles = [], children, fallback = '/dashboard' }) {
  const location = useLocation();
  const token = getToken();
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />;
  const userRoles = getUserRolesFromToken(token);
  return hasAnyRole(userRoles, roles) ? children : <Navigate to={fallback} replace />;
}
// --- end role helpers ---

// Decides where to land after auth based on role
function LandingRedirect() {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  const roles = getUserRolesFromToken(token);
  if (Array.isArray(roles) && roles.includes('ROLE_MANAGER')) {
    return <Navigate to="/manager-dashboard" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

// PrivateRoute wrapper to check authentication
function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  const location = useLocation();
  return token ? children : <Navigate to="/login" replace state={{ from: location }} />;
}

function App() {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Router>
        <PreferredShellStickyRedirect />
        <Routes>
        {/* Login Page */}
        <Route path="/login" element={<Login />} />

        {/* All other pages wrapped in Layout and protected */}
        <Route
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route
            path="/services-payments"
            element={
              <RoleRoute roles={['ROLE_ADMIN', 'ROLE_MANAGER']}>
                <ServicesPaymentsV2 />
              </RoleRoute>
            }
          />
          <Route index element={<LandingRedirect />} />
          <Route path="/" element={<LandingRedirect />} />
          <Route
            path="/dashboard"
            element={
              <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER']}>
                <Dashboard />
              </RoleRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER']}>
                <SeeBookings />
              </RoleRoute>
            }
          />
          <Route
            path="/bookings-basic"
            element={<Navigate to="/bookings?view=basic" replace />}
          />
          <Route
            path="/see-bookings-basic"
            element={<Navigate to="/bookings?view=basic" replace />}
          />
          <Route path="/bookings/search" element={<MobileBookingsSearch />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/new" element={<ClientForm />} />
          <Route path="/clients/edit/:id" element={<EditClientForm />} />
          <Route path="/units" element={<Units />} />
          <Route path="/units/:id" element={<UnitDetails />} />
          <Route path="/units-media" element={<UnitMedia />} />
          <Route path="/settings" element={<div>Settings Page</div>} />
          <Route path="/condos" element={<Condos />} />
          <Route path="/condos/edit/:id" element={<EditCondoForm />} />
          <Route path="/condos/new" element={<NewCondoForm />} />
          <Route path="/hk-transactions" element={<HKTransactions />} />
          <Route path="/hr-transactions" element={<HRTransactions />} />
          <Route
            path="/employee-cash-admin"
            element={
              <RoleRoute roles={['ROLE_ADMIN', 'ROLE_MANAGER']}>
                <EmployeeCashAdmin />
              </RoleRoute>
            }
          />
          <Route path="/hk-transactions/new" element={<HKTransactionForm />} />
          <Route path="/hk-transactions/edit/:id" element={<EditHKTransactionForm />} />
          <Route path="/hk-results" element={<HKResults />} />
        <Route path="/hk-cleanings" element={<HKCleaningsView />} />
        <Route
          path="/hk-cleanings-reconcile"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER']}>
              <HKCleaningsRecon />
            </RoleRoute>
          }
        />
        <Route path="/check-in-out" element={<CheckInOutView />} />
        <Route path="/bookings-timeline" element={<BookingsTimeline />} />
        <Route
          path="/bookings-ical"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER']}>
              <AirbnbCalTable />
            </RoleRoute>
          }
        />
          <Route path="/unit-transactions" element={<Owners2UnitTransactions />} />
          <Route path="/unit-transactions/new" element={<UnitTransactionNewFormRHF />} />
          <Route path="/unit-transactions/edit/:id" element={<EditUnitTransactionForm />} />
          <Route path="/o2-transactions" element={<O2Transactions />} />
          <Route path="/o2-transactions/new" element={<NewO2TransactionForm />} />
          <Route path="/o2-transactions/edit/:id" element={<EditO2TransactionForm />} />
          <Route path="/o2-results" element={<O2Results />} />
          <Route
            path="/reports"
            element={
              <RoleRoute roles={['ROLE_ADMIN', 'ROLE_MANAGER']}>
                <Reports />
              </RoleRoute>
            }
          />
          <Route
            path="/accounting/import"
            element={
              <RoleRoute roles={['ROLE_ADMIN', 'ROLE_MANAGER']}>
                <AccountingRecords />
              </RoleRoute>
            }
          />
          <Route
            path="/airbnb-payouts-recon"
            element={
              <RoleRoute roles={['ROLE_ADMIN', 'ROLE_MANAGER']}>
                <AirbnbPayoutsRecon />
              </RoleRoute>
            }
          />
          <Route path="/occupancy-report" element={<Occupancy />} />
          <Route
            path="/unit-monthly-report"
            element={
              <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER']}>
                <UnitMonthlyReport />
              </RoleRoute>
            }
          />
          <Route path="/manager-dashboard" element={<ManagerDashboard />} />
          <Route path="/report-comments" element={<ReportComments />} />
          <Route
            path="/report-comments/add"
            element={
              <RoleRoute roles={['ROLE_ADMIN', 'ROLE_MANAGER']}>
                <NewReportCommentForm />
              </RoleRoute>
            }
          />
          <Route path="/client-unit-notes/new" element={<NewClientUnitNote />} />
          <Route path="/unit-balance" element={<UnitBalance />} />
          <Route path="/unit-balance/:unitId" element={<UnitBalance />} />
          <Route path="/unit-balance-ledger/new" element={<NewUnitLedgerForm />} />
          <Route path="/unit-balance-ledger/edit/:id" element={<EditUnitLedgerForm />} />
          <Route path="/dev/icons" element={<IconGallery />} />
          <Route path="/unit-contract" element={<UnitContract />} />
          <Route path="/employees" element={<Employees />} />
          <Route
            path="/employee-tasks"
            element={
              <RoleRoute roles={['ROLE_ADMIN', 'ROLE_MANAGER']}>
                <EmployeeTasks />
              </RoleRoute>
            }
          />
          <Route path="/social-posts" element={<SocialPosts />} />
          <Route path="/social-calendar" element={<SocialCalendar />} />
          <Route
            path="/inventory/review"
            element={
              <RoleRoute roles={['ROLE_ADMIN', 'ROLE_MANAGER']}>
                <UnitInventoryPage />
              </RoleRoute>
            }
          />
        </Route>

        {/* ===================== Public Routes (no auth) ===================== */}
        <Route path="/p/share/:token" element={<ShareLinkHandler />} />

        {/* ===================== Mobile Routes (no desktop Layout) ===================== */}
        <Route path="/m/login" element={<Login />} />
        <Route
          path="/m/dashboard"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER','ROLE_EMPLOYEE']}>
              <MobileShell titleKey="mobile.dashboard">
                <MobileDashboard />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/tasks/:id"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER','ROLE_CLIENT','ROLE_EMPLOYEE']}>
              <MobileShell titleKey="mobile.editTask">
                <MobileTaskEditForm />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/unit-details"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER','ROLE_CLIENT','ROLE_EMPLOYEE']}>
              <MobileShell titleKey="mobile.unitDetails">
                <MobileUnitDetails />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/bookings-calendar"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER','ROLE_CLIENT','ROLE_EMPLOYEE']}>
              <MobileShell titleKey="mobile.bookingsCalendar">
                <MobileBookingsCalendar />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/bookings-search"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER','ROLE_CLIENT']}>
              <MobileShell titleKey="mobile.searchBookings">
                <MobileBookingsSearch />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/check-activity"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER','ROLE_CLIENT','ROLE_EMPLOYEE']}>
              <MobileShell titleKey="mobile.checkActivity">
                <MobileCheckInOutView />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/employee-cash"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER','ROLE_EMPLOYEE']}>
              <MobileShell titleKey="mobile.cashLedger">
                <MobileEmployeeCash />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/employee-cash/new"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER','ROLE_EMPLOYEE']}>
              <MobileShell titleKey="mobile.newCashEntry">
                <MobileCashForm />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/employee-cash/edit/:id"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER','ROLE_EMPLOYEE']}>
              <MobileShell titleKey="mobile.editCashEntry">
                <MobileCashEditForm />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/inventory"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER']}>
              <MobileShell titleKey="mobile.onboardingUnits">
                <MobileInventoryNew />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/inventory/form/:sessionId"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER']}>
              <MobileShell titleKey="mobile.unitInventory">
                <MobileInventoryForm />
              </MobileShell>
            </RoleRoute>
          }
        />
        <Route
          path="/m/inventory/review/:sessionId"
          element={
            <RoleRoute roles={['ROLE_ADMIN','ROLE_MANAGER']}>
              <MobileShell titleKey="mobile.reviewSubmit">
                <MobileInventoryReview />
              </MobileShell>
            </RoleRoute>
          }
        />
        {/* =================== End Mobile Routes (no desktop Layout) =================== */}

        <Route
          path="/m"
          element={<Navigate to="/m/dashboard" replace />}
        />
        {/* Default route: redirect to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </LocalizationProvider>
  );
}

export default App;
