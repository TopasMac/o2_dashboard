import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PrivateRoute = ({ children, roles = [] }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    // Preserve where the user intended to go (e.g., /m) so we can return there after login
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // If the user is authenticated and is on the mobile shell (/m or /m/...),
  // allow rendering here to avoid being bounced to desktop routes by any global logic.
  const path = location.pathname || '';
  const isMobileShell = path === '/m' || path.startsWith('/m/');
  if (isMobileShell) {
    return children;
  }

  if (roles.length && !roles.some(role => user.roles.includes(role))) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default PrivateRoute;