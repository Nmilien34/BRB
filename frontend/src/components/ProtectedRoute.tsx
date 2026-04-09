import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function ProtectedRoute() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <span style={{ color: '#94a3b8', fontSize: 14, fontFamily: "'Geist', system-ui, sans-serif" }}>
          Loading…
        </span>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/signin" replace />;
  }

  return <Outlet />;
}
