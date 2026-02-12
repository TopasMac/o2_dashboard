import {
  HomeIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  BuildingOffice2Icon,
  ArrowsRightLeftIcon,
  PresentationChartLineIcon,
  DocumentChartBarIcon,
  ScaleIcon,
  ClipboardDocumentCheckIcon,
  ArrowsUpDownIcon,
  SparklesIcon,
  ReceiptPercentIcon,
  DocumentDuplicateIcon,
  WrenchScrewdriverIcon,
  FolderIcon,
  HomeModernIcon,
  CurrencyDollarIcon,
  PhotoIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const SIDEBAR_WIDTH = 240; // fixed width in px for desktop and mobile
const NAV_RAIL_WIDTH = 80; // thin rail width when collapsed
const NAV_RAIL_TOP_OFFSET = 42; // push rail content down to align with page titles

const RailButton = ({ title, onClick, active, children }) => (
  <button
    title={title}
    aria-label={title}
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '48px',
      height: '48px',
      margin: '8px auto',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: '#fff'
    }}
  >
    {children}
  </button>
);

const PanelLink = ({ to, label, icon: Icon, active, onClick }) => (
  <Link
    to={to}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      color: active ? '#F57C4D' : '#0F2E2C',
      textDecoration: 'none',
      fontWeight: active ? '700' : '400',
      fontSize: '15px',
      padding: '6px 8px',
      borderRadius: '6px',
      transition: 'background 120ms ease'
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(30,111,104,0.08)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    onClick={onClick}
  >
    <Icon style={{ width: '22px', height: '22px' }} />
    <span>{label}</span>
  </Link>
);

// --- role helpers (sidebar visibility) ---
const hasAnyRole = (userRoles = [], allowedRoles = []) => {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  const set = new Set((userRoles || []).map(String));
  return allowedRoles.some(r => set.has(String(r)));
};
// ----------------------------------------

const Sidebar = ({ mobileOpen, setMobileOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  // expandedGroup: 'management' | 'transactions' | 'housekeepers' | 'reports' | 'marketing' | null
  // options: group names for expanded panel, e.g. 'management', 'transactions', 'housekeepers', 'reports', 'marketing'
  const [expandedGroup, setExpandedGroup] = useState(null);


  // Retrieve user roles from localStorage or auth context
  let roles = [];
  try {
    const raw = localStorage.getItem('roles');
    const parsed = raw ? JSON.parse(raw) : [];
    roles = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    roles = [];
  }
  const isDev = process.env.NODE_ENV !== 'production';
  const isAdmin = roles.includes('ROLE_ADMIN');
  const isManager = roles.includes('ROLE_MANAGER');
  const canSee = (allowed) => hasAnyRole(roles, allowed);

  const toggleGroup = (name) => {
    setExpandedGroup(prev => (prev === name ? null : name));
  };

  const bookingsActive = (
    location.pathname.startsWith('/bookings') ||
    location.pathname.startsWith('/bookings-timeline')
  );
  const housekeepersActive = (
    location.pathname.startsWith('/check-in-out') ||
    location.pathname.startsWith('/hk-cleanings') ||
    location.pathname.startsWith('/hk-transactions') ||
    location.pathname.startsWith('/inventory')
  );
  const unitsActive = location.pathname.startsWith('/units') || location.pathname.startsWith('/unit-balance');
  const transactionsActive = (
    location.pathname.startsWith('/o2-transactions') ||
    location.pathname.startsWith('/unit-transactions')
  );
  const managementActive = (
    location.pathname.startsWith('/clients') ||
    location.pathname.startsWith('/units') ||
    location.pathname.startsWith('/condos') ||
    location.pathname.startsWith('/employees')
  );
  const reportsActive = (
    location.pathname === '/o2-results' ||
    location.pathname === '/unit-monthly-report' ||
    location.pathname.startsWith('/unit-balance') ||
    location.pathname.startsWith('/accounting')
  );

  const marketingActive = (
    location.pathname.startsWith('/social-posts') ||
    location.pathname.startsWith('/social-calendar')
  );

  return (
    <>
      <>
        <div
          style={{
            width: expandedGroup ? `${SIDEBAR_WIDTH}px` : `${NAV_RAIL_WIDTH}px`,
            minWidth: expandedGroup ? `${SIDEBAR_WIDTH}px` : `${NAV_RAIL_WIDTH}px`,
            maxWidth: expandedGroup ? `${SIDEBAR_WIDTH}px` : `${NAV_RAIL_WIDTH}px`,
            flex: `0 0 ${expandedGroup ? SIDEBAR_WIDTH : NAV_RAIL_WIDTH}px`,
            boxSizing: 'border-box',
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 1101,
            height: '100vh',
            display: 'flex',
            background: '#154E49',
            color: '#fff',
            boxShadow: 'none'
          }}
        >
            {/* RAIL */}
            <div style={{
              width: `${NAV_RAIL_WIDTH}px`,
              minWidth: `${NAV_RAIL_WIDTH}px`,
              borderRight: expandedGroup ? '1px solid rgba(255,255,255,0.08)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: `${NAV_RAIL_TOP_OFFSET}px`
            }}>
            {/* Brand */}
            <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '12px' }}>O2</div>

              {/* Rail icons: links (do not expand) */}
              {hasAnyRole(roles, ['ROLE_ADMIN']) && (
                <RailButton title="Dashboard" active={location.pathname === '/dashboard'} onClick={() => navigate('/dashboard')}>
                  <HomeIcon style={{ width: 28, height: 28, color: location.pathname === '/dashboard' ? '#F57C4D' : '#fff' }} />
                </RailButton>
              )}
              {canSee(['ROLE_ADMIN', 'ROLE_MANAGER']) && (
                <RailButton title="Management" active={expandedGroup === 'management' || managementActive} onClick={() => toggleGroup('management')}>
                  <FolderIcon style={{ width: 28, height: 28, color: (expandedGroup === 'management' || managementActive) ? '#F57C4D' : '#fff' }} />
                </RailButton>
              )}
              {hasAnyRole(roles, ['ROLE_MANAGER']) && (
                <RailButton title="Manager" active={location.pathname === '/manager-dashboard'} onClick={() => navigate('/manager-dashboard')}>
                  <HomeIcon style={{ width: 28, height: 28, color: location.pathname === '/manager-dashboard' ? '#F57C4D' : '#fff' }} />
                </RailButton>
              )}
              {canSee(['ROLE_ADMIN', 'ROLE_MANAGER']) && (
                <RailButton title="Bookings" active={expandedGroup === 'bookings' || bookingsActive} onClick={() => toggleGroup('bookings')}>
                  <CalendarDaysIcon style={{ width: 28, height: 28, color: (expandedGroup === 'bookings' || bookingsActive) ? '#F57C4D' : '#fff' }} />
                </RailButton>
              )}
              {canSee(['ROLE_ADMIN', 'ROLE_MANAGER']) && (
                <RailButton title="Transactions" active={expandedGroup === 'transactions' || transactionsActive} onClick={() => toggleGroup('transactions')}>
                  <BanknotesIcon style={{ width: 28, height: 28, color: (expandedGroup === 'transactions' || transactionsActive) ? '#F57C4D' : '#fff' }} />
                </RailButton>
              )}
              {hasAnyRole(roles, ['ROLE_ADMIN', 'ROLE_MANAGER']) && (
                <RailButton title="Occupancy" active={location.pathname === '/occupancy-report'} onClick={() => navigate('/occupancy-report')}>
                  <ChartBarIcon style={{ width: 28, height: 28, color: location.pathname === '/occupancy-report' ? '#F57C4D' : '#fff' }} />
                </RailButton>
              )}

              {/* Divider */}
              <div style={{ width: '28px', height: 1, background: 'rgba(255,255,255,0.12)', margin: '8px 0' }} />

              {/* Rail icons: GROUPS (expand panel on click) */}
              {(isAdmin || isManager) && (
                <RailButton title="Housekeepers" active={expandedGroup === 'housekeepers' || housekeepersActive} onClick={() => toggleGroup('housekeepers')}>
                  <WrenchScrewdriverIcon style={{ width: 28, height: 28, color: (expandedGroup === 'housekeepers' || housekeepersActive) ? '#F57C4D' : '#fff' }} />
                </RailButton>
              )}
              {isAdmin && (
                <RailButton title="Reports" active={expandedGroup === 'reports' || reportsActive} onClick={() => toggleGroup('reports')}>
                  <DocumentDuplicateIcon style={{ width: 28, height: 28, color: (expandedGroup === 'reports' || reportsActive) ? '#F57C4D' : '#fff' }} />
                </RailButton>
              )}
              {hasAnyRole(roles, ['ROLE_ADMIN']) && (
                <RailButton
                  title="Marketing"
                  active={expandedGroup === 'marketing' || marketingActive}
                  onClick={() => toggleGroup('marketing')}
                >
                  <PresentationChartLineIcon style={{ width: 28, height: 28, color: (expandedGroup === 'marketing' || marketingActive) ? '#F57C4D' : '#fff' }} />
                </RailButton>
              )}
              {hasAnyRole(roles, ['ROLE_ADMIN']) && (
                <RailButton title="Settings" active={location.pathname === '/settings'} onClick={() => navigate('/settings')}>
                  <Cog6ToothIcon style={{ width: 28, height: 28, color: location.pathname === '/settings' ? '#F57C4D' : '#fff' }} />
                </RailButton>
              )}

              {/* Dev-only icon gallery link */}
              {process.env.NODE_ENV === 'development' && isAdmin && (
                <RailButton title="Icons" active={location.pathname === '/dev/icons'} onClick={() => navigate('/dev/icons')}>
                  <span style={{ fontSize: 16, color: location.pathname === '/dev/icons' ? '#F57C4D' : '#fff' }}>🧰</span>
                </RailButton>
              )}

              {/* Sign out at bottom */}
              <div style={{ flex: 1 }} />
              <RailButton title="Sign out" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('name'); localStorage.removeItem('roles'); navigate('/login', { replace: true }); }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>⎋</span>
              </RailButton>
            </div>

            {/* EXPANDED PANEL (only when a group is active) */}
            {expandedGroup && (
              <div style={{
                flex: 1,
                background: '#F1FAF9',
                color: '#0F2E2C',
                padding: `${NAV_RAIL_TOP_OFFSET}px 16px 20px 16px`,
                display: 'flex',
                flexDirection: 'column',
                textAlign: 'center'
              }}>
                <div style={{ fontWeight: 800, marginBottom: '16px', textAlign: 'center', width: '100%', fontSize: '18px' }}>{
                  expandedGroup === 'bookings' ? 'Bookings' :
                  expandedGroup === 'management' ? 'Management' :
                  expandedGroup === 'transactions' ? 'Transactions' :
                  expandedGroup === 'housekeepers' ? 'Housekeepers' :
                  expandedGroup === 'reports' ? 'Reports' :
                  'Marketing'
                }</div>
                <nav>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {/* Bookings */}
                    {expandedGroup === 'bookings' && (
                      <>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/bookings?view=basic" label="Table" icon={DocumentTextIcon} active={location.pathname.startsWith('/bookings')} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/bookings-timeline" label="Calendar" icon={CalendarDaysIcon} active={location.pathname.startsWith('/bookings-timeline')} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink
                            to="/bookings-ical"
                            label="iCal Table"
                            icon={ArrowsRightLeftIcon}
                            active={location.pathname.startsWith('/bookings-ical')}
                            onClick={() => {}}
                          />
                        </li>
                      </>
                    )}

                    {/* Management */}
                    {expandedGroup === 'management' && (
                      <>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/clients" label="Clients" icon={UserGroupIcon} active={location.pathname === '/clients'} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/units" label="Units" icon={BuildingOfficeIcon} active={location.pathname === '/units'} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink
                            to="/units-media"
                            label="Unit Media"
                            icon={PhotoIcon}
                            active={location.pathname === '/units-media'}
                            onClick={() => {}}
                          />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/condos" label="Condos" icon={BuildingOffice2Icon} active={location.pathname === '/condos'} onClick={() => {}} />
                        </li>
                        {(isAdmin || isManager) && (
                          <li style={{ marginBottom: '8px' }}>
                            <PanelLink
                              to="/employees"
                              label="HR"
                              icon={UserGroupIcon}
                              active={location.pathname === '/employees'}
                              onClick={() => {}}
                            />
                          </li>
                        )}
                      </>
                    )}

                    {/* Transactions */}
                    {expandedGroup === 'transactions' && (
                      <>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/o2-transactions" label="Owners2 Transactions" icon={BanknotesIcon} active={location.pathname === '/o2-transactions'} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/unit-transactions" label="Unit Transactions" icon={HomeModernIcon} active={location.pathname === '/unit-transactions'} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink
                            to="/services-payments"
                            label="Services Payments"
                            icon={BanknotesIcon}
                            active={location.pathname === '/services-payments'}
                            onClick={() => {}}
                          />
                        </li>
                        {isAdmin && (
                          <li style={{ marginBottom: '8px' }}>
                            <PanelLink
                              to="/hr-transactions"
                              label="HR Transactions"
                              icon={BanknotesIcon}
                              active={location.pathname === '/hr-transactions'}
                              onClick={() => {}}
                            />
                          </li>
                        )}
                      </>
                    )}

                    {/* Housekeepers */}
                    {expandedGroup === 'housekeepers' && (
                      <>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/check-in-out" label="CheckInOut View" icon={ArrowsUpDownIcon} active={location.pathname === '/check-in-out'} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/hk-cleanings" label="Cleanings Table" icon={SparklesIcon} active={location.pathname === '/hk-cleanings'} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink
                            to="/inventory/review"
                            label="Unit Inventory"
                            icon={ClipboardDocumentListIcon}
                            active={location.pathname.startsWith('/inventory')}
                            onClick={() => {}}
                          />
                        </li>
                        {isAdmin && (
                          <li style={{ marginBottom: '8px' }}>
                            <PanelLink to="/hk-transactions" label="HK Transactions" icon={ReceiptPercentIcon} active={location.pathname === '/hk-transactions'} onClick={() => {}} />
                          </li>
                        )}
                      </>
                    )}

                    {/* Reports */}
                    {expandedGroup === 'reports' && (
                      <>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/o2-results" label="O2 Results" icon={PresentationChartLineIcon} active={location.pathname === '/o2-results'} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/unit-monthly-report" label="Unit Report" icon={DocumentChartBarIcon} active={location.pathname === '/unit-monthly-report'} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink to="/unit-balance" label="Unit Balance" icon={ScaleIcon} active={location.pathname.startsWith('/unit-balance')} onClick={() => {}} />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink
                            to="/accounting/import"
                            label="Accounting"
                            icon={DocumentTextIcon}
                            active={location.pathname.startsWith('/accounting')}
                            onClick={() => {}}
                          />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink
                            to="/airbnb-payouts-recon"
                            label="Airbnb Payouts"
                            icon={CurrencyDollarIcon}
                            active={location.pathname.startsWith('/airbnb-payouts-recon')}
                            onClick={() => {}}
                          />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink
                            to="/airbnb-resolutions"
                            label="Airbnb Resolutions"
                            icon={ClipboardDocumentCheckIcon}
                            active={location.pathname.startsWith('/airbnb-resolutions')}
                            onClick={() => {}}
                          />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink
                            to="/unit-contract"
                            label="Contracts"
                            icon={DocumentTextIcon}
                            active={location.pathname.startsWith('/unit-contract')}
                            onClick={() => {}}
                          />
                        </li>
                      </>
                    )}

                    {/* Marketing */}
                    {expandedGroup === 'marketing' && (
                      <>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink
                            to="/social-posts"
                            label="Social Posts"
                            icon={DocumentTextIcon}
                            active={location.pathname.startsWith('/social-posts')}
                            onClick={() => {}}
                          />
                        </li>
                        <li style={{ marginBottom: '8px' }}>
                          <PanelLink
                            to="/social-calendar"
                            label="Social Calendar"
                            icon={CalendarDaysIcon}
                            active={location.pathname.startsWith('/social-calendar')}
                            onClick={() => {}}
                          />
                        </li>
                      </>
                    )}
                  </ul>
                </nav>
              </div>
            )}
          </div>
        {/* Spacer to preserve layout */}
        <div style={{
          width: expandedGroup ? `${SIDEBAR_WIDTH}px` : `${NAV_RAIL_WIDTH}px`,
          minWidth: expandedGroup ? `${SIDEBAR_WIDTH}px` : `${NAV_RAIL_WIDTH}px`,
          maxWidth: expandedGroup ? `${SIDEBAR_WIDTH}px` : `${NAV_RAIL_WIDTH}px`,
          flex: `0 0 ${expandedGroup ? SIDEBAR_WIDTH : NAV_RAIL_WIDTH}px`
        }} />
      </>
    </>
  );
};

export default Sidebar;
