import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { Button } from './ui/Button';

/** Replaces Mendix SNIP_CurrentUser. */
export function CurrentUserBadge() {
  const { fullName, email, role, signOut } = useCurrentUser();

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium text-slate-900">{fullName ?? email}</p>
        <p className="text-xs capitalize text-slate-500">{role?.replace('_', ' ')}</p>
      </div>
      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
