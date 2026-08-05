import { Navigate, Outlet } from 'react-router-dom';
import { useCurrentUser } from './useCurrentUser';
import { Spinner } from '@/components/ui/Spinner';
import type { UserRole } from '@/lib/database.types';

/**
 * Route guard for admin screens.
 *
 * This stops a `user` navigating to /admin and seeing a broken page. It does
 * NOT stop them querying the data — only RLS does that. Never let a guard
 * substitute for a policy. (docs/specs/00-auth-and-roles.md §6)
 */
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { loading, hasRole } = useCurrentUser();

  if (loading) return <Spinner label="Loading…" />;
  if (!hasRole(roles)) return <Navigate to="/" replace />;
  return <Outlet />;
}
