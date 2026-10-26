import { Navigate } from 'react-router-dom';

// Stage 2 stub: always lets the user through.
// Stage 3 will check the logged-in user (GET /api/auth/me) and redirect to /login.
const IS_LOGGED_IN = true;

export default function ProtectedRoute({ children }) {
  if (!IS_LOGGED_IN) return <Navigate to="/login" replace />;
  return children;
}
