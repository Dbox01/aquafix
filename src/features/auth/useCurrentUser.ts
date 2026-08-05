import { useAuth } from './AuthProvider';
import type { UserRole } from '@/lib/database.types';

/**
 * Replaces Mendix DS_Account_CurrentUser.
 *
 * `canDelete` mirrors the RLS policy (`user` has AllowDelete = false), but it
 * only hides buttons. The policy is the security. (docs/specs/01-*.md §4)
 */
export function useCurrentUser() {
  const { session, profile, role, loading, signOut } = useAuth();

  const isAdmin = role === 'admin' || role === 'system_admin';

  return {
    loading,
    isAuthenticated: !!session && !!profile,
    userId: session?.user?.id ?? null,
    email: profile?.email ?? session?.user?.email ?? null,
    fullName: profile?.full_name ?? null,
    role,
    isAdmin,
    isSystemAdmin: role === 'system_admin',
    canDelete: isAdmin,
    hasRole: (roles: UserRole[]) => (role ? roles.includes(role) : false),
    signOut,
  };
}
