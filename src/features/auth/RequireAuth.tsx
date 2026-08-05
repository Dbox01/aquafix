import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from './useCurrentUser';
import { Spinner } from '@/components/ui/Spinner';

/** Route guard. UX only — RLS is what actually protects the data. */
export function RequireAuth() {
  const { loading, isAuthenticated } = useCurrentUser();
  const location = useLocation();

  if (loading) return <Spinner label="Loading…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
