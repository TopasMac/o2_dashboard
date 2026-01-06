import React from 'react';
import PageScaffold from '../PageScaffold';
import { useLocation } from 'react-router-dom';

/**
 * ReportsLayout
 * Wraps all pages under the "Reports" group so the top bar shows the group name
 * and SectionHeader renders the group's submenu (Unit Monthly, O2 Results, HK Results, etc).
 */

export default function ReportsLayout({ children }) {
  const location = useLocation();

  return (
    <PageScaffold
      title="Reports"
      layout="standard"
      withCard={false}
      headerPlacement="section"
      currentPath={location.pathname}
    >
      {children}
    </PageScaffold>
  );
}
