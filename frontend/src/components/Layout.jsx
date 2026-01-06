import React from 'react';
import { Outlet } from 'react-router-dom';

const Layout = ({ children }) => {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <main
          id="app-content"
          data-scroll-container
          style={{
            padding: '20px',
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollBehavior: 'auto'
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
