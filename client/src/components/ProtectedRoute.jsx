import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

// Not logged in -> /login. Wrong role (when `roles` is given) -> home.
// This only improves the UI; the server still checks every request.
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-6 text-slate-600">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}