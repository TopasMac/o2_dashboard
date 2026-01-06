import React from 'react';

// Add mobile-only CSS class for sidebar toggle button
const mobileToggleStyles = `
.sidebar-toggle-btn {
  display: none;
}
@media (max-width: 768px) {
  .sidebar-toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: var(--fs-18);
    background: none;
    border: none;
    color: #FF7F50;
    margin-right: 1rem;
    cursor: pointer;
    padding: 0 0.5rem;
    height: 2rem;
  }
}
@media (min-width: 769px) {
  .sidebar-toggle-btn {
    color: #1E6F68;
  }
}
`;

const Header = ({ onToggleSidebar }) => {
  const name = localStorage.getItem('name') || 'Guest';

  return (
    <>
      <style>{mobileToggleStyles}</style>
      <header
        style={{
          background: '#F9F9F6',
          boxSizing: 'border-box',
          padding: '0 2rem',
          borderBottom: '1px solid #ddd',
          position: 'sticky',
          top: 0,
          zIndex: 1200,
          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
          height: 'var(--app-header-height)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '100%',
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              className="sidebar-toggle-btn"
              aria-label="Open sidebar"
              type="button"
              onClick={onToggleSidebar}
            >
              &#9776;
            </button>
            <h1 style={{ margin: 0, marginLeft: '0.5rem', fontSize: 'var(--fs-18)', color: '#1E6F68' }}>
              Owners2 Dashboard
            </h1>
          </div>
          <div style={{ fontSize: 'var(--fs-13)', color: '#4B4F56' }}>
            Hello {name}
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;
