import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/assistants', label: 'Assistants' },
  { to: '/phone', label: 'Phone Setup' },
  { to: '/approvals', label: 'Approvals' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav
        style={{
          width: 220,
          padding: '24px 16px',
          borderRight: '1px solid #e0e0e0',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>BRB</h1>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              padding: '8px 12px',
              borderRadius: 6,
              background: isActive ? '#e8f0fe' : 'transparent',
              color: isActive ? '#1a73e8' : '#213547',
              fontWeight: isActive ? 600 : 400,
              textDecoration: 'none',
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 32 }}>
        <Outlet />
      </main>
    </div>
  );
}
