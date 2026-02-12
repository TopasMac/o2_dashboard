// heroicons (solid) for stronger rail readability
import {
    HomeIcon,
    FolderIcon,
    CalendarDaysIcon,
    BanknotesIcon,
    ChartBarIcon,
    WrenchScrewdriverIcon,
    DocumentDuplicateIcon,
    PresentationChartLineIcon,
    Cog6ToothIcon,
    PhotoIcon,
    BuildingOfficeIcon,
    BuildingOffice2Icon,
    UserGroupIcon,
    ArrowsRightLeftIcon,
    DocumentTextIcon,
    DocumentChartBarIcon,
    ScaleIcon,
    CurrencyDollarIcon,
    ClipboardDocumentCheckIcon,
    ClipboardDocumentListIcon,
    HomeModernIcon,
    ReceiptPercentIcon,
    ExclamationTriangleIcon,
  } from '@heroicons/react/24/solid';
  
  // Optional: role hints; AppShell will filter if you pass a `roles` array later
  const NAV_ITEMS = [
    // Direct links (no submenu)
    { key: 'dashboard', label: 'Dashboard', icon: HomeIcon, to: '/dashboard', roles: ['ROLE_ADMIN'] },
    { key: 'manager', label: 'Manager', icon: HomeIcon, to: '/manager-dashboard', roles: ['ROLE_MANAGER'] },
    { key: 'settings', label: 'Settings', icon: Cog6ToothIcon, to: '/settings', roles: ['ROLE_ADMIN'] },
  
    // Group: Management
    {
      key: 'management',
      label: 'Management',
      icon: FolderIcon,
      roles: ['ROLE_ADMIN','ROLE_MANAGER'],
      submenu: [
        { label: 'Clients', icon: UserGroupIcon, to: '/clients' },
        { label: 'Units', icon: BuildingOfficeIcon, to: '/units' },
        { label: 'Unit Media', icon: PhotoIcon, to: '/units-media' },
        { label: 'Condos', icon: BuildingOffice2Icon, to: '/condos' },
        { label: 'HR', icon: UserGroupIcon, to: '/employees', roles: ['ROLE_ADMIN','ROLE_MANAGER'] },
        { label: 'Tasks', icon: ClipboardDocumentCheckIcon, to: '/employee-tasks', roles: ['ROLE_ADMIN','ROLE_MANAGER'] },
      ],
    },
  
    // Group: Bookings
    {
      key: 'bookings',
      label: 'Bookings',
      icon: CalendarDaysIcon,
      roles: ['ROLE_ADMIN','ROLE_MANAGER'],
      submenu: [
        { label: 'Table', icon: DocumentTextIcon, to: '/bookings' },
        { label: 'Calendar', icon: CalendarDaysIcon, to: '/bookings-timeline' },
        { label: 'CheckInOut', icon: ArrowsRightLeftIcon, to: '/check-in-out' },
        { label: 'iCal Table', icon: ExclamationTriangleIcon, to: '/bookings-ical' },
      ],
    },
  
    // Group: Transactions
    {
      key: 'transactions',
      label: 'Transactions',
      icon: BanknotesIcon,
      roles: ['ROLE_ADMIN','ROLE_MANAGER'],
      submenu: [
        { label: 'Employee Transactions', icon: BanknotesIcon, to: '/employee-cash-admin', roles: ['ROLE_ADMIN','ROLE_MANAGER'] },
        { label: 'Owners2 Transactions', icon: BanknotesIcon, to: '/o2-transactions' },
        { label: 'Unit Transactions', icon: HomeModernIcon, to: '/unit-transactions' },
        { label: 'HK Transactions', icon: ReceiptPercentIcon, to: '/hk-transactions', roles: ['ROLE_ADMIN','ROLE_MANAGER'] },
        { label: 'Services Payments', icon: BanknotesIcon, to: '/services-payments' },
        { label: 'HR Transactions', icon: BanknotesIcon, to: '/hr-transactions', roles: ['ROLE_ADMIN'] },
      ],
    },
  
    // Group: Housekeepers
    {
      key: 'housekeepers',
      label: 'Housekeepers',
      icon: WrenchScrewdriverIcon,
      roles: ['ROLE_ADMIN','ROLE_MANAGER'],
      submenu: [
        { label: 'CheckInOut View', icon: ArrowsRightLeftIcon, to: '/check-in-out' }, // using arrows icon for turnover vibe
        { label: 'Cleanings Table', icon: ReceiptPercentIcon, to: '/hk-cleanings' }, // (you can swap back to Sparkles if you prefer)
        { 
          label: 'HK Reconciliation', 
          icon: DocumentChartBarIcon, 
          to: '/hk-cleanings-reconcile',
          roles: ['ROLE_ADMIN','ROLE_MANAGER'],
        },
        { label: 'Unit Inventory', icon: ClipboardDocumentListIcon, to: '/inventory/review' },
      ],
    },
  
    // Group: Reports
    {
      key: 'reports',
      label: 'Reports',
      icon: DocumentDuplicateIcon,
      roles: ['ROLE_ADMIN'],
      submenu: [
        { label: 'O2 Results', icon: PresentationChartLineIcon, to: '/o2-results' },
        { label: 'Unit Report', icon: DocumentChartBarIcon, to: '/unit-monthly-report' },
        { label: 'Unit Balance', icon: ScaleIcon, to: '/unit-balance' },
        { label: 'Accounting', icon: DocumentTextIcon, to: '/accounting/import' },
        { label: 'Airbnb Payouts', icon: CurrencyDollarIcon, to: '/airbnb-payouts-recon' },
        { label: 'Contracts', icon: DocumentTextIcon, to: '/unit-contract' },
      ],
    },
  
    // Group: Marketing
    {
      key: 'marketing',
      label: 'Marketing',
      icon: PresentationChartLineIcon,
      roles: ['ROLE_ADMIN'],
      submenu: [
        { label: 'Social Posts', icon: DocumentTextIcon, to: '/social-posts' },
        { label: 'Social Calendar', icon: CalendarDaysIcon, to: '/social-calendar' },
      ],
    },
  
  // Dev (optional)
  // { key: 'icons', label: 'Icons', icon: PresentationChartLineIcon, to: '/dev/icons', roles: ['ROLE_ADMIN'] },
  ];
  
  export default NAV_ITEMS;
  
  // Named constants for nav groups for easier access in TopBar/PageScaffold.
  // Derived from NAV_ITEMS so sidebar and section headers stay in sync.
  const buildLinksFromGroup = (groupKey) => {
    const group = NAV_ITEMS.find((item) => item.key === groupKey);
    if (!group || !group.submenu) return null;
  
    return {
      key: group.key,
      label: group.label,
      links: group.submenu.map(({ label, to, roles }) => ({
        label,
        to,
        roles,
      })),
    };
  };
  
export const NAV_GROUPS = {
  management: buildLinksFromGroup('management'),
  bookings: buildLinksFromGroup('bookings'),
  housekeepers: buildLinksFromGroup('housekeepers'),
  transactions: buildLinksFromGroup('transactions'),
  reports: buildLinksFromGroup('reports'),
};
