import { NavLink, Outlet } from 'react-router-dom';
import { CurrentUserBadge } from './CurrentUserBadge';
import { useCurrentUser } from '@/features/auth/useCurrentUser';

/** Replaces Mendix Main_Layout. One responsive shell, not web + PWA (ADR-007). */
export function AppShell() {
  const { isAdmin } = useCurrentUser();

  const link = ({ isActive }: { isActive: boolean }) =>
    `touch-target inline-flex items-center rounded-md px-3 py-2 text-sm font-medium ${
      isActive ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <NavLink to="/" className="text-lg font-semibold text-brand-800">
            AquaFix
          </NavLink>
          {/* Field work first, configuration last — the order a field worker
              needs, not the order the data model was built in. */}
          <nav className="flex flex-1 flex-wrap gap-1">
            <NavLink to="/inspect" className={link}>
              Inspect
            </NavLink>
            <NavLink to="/activities" className={link}>
              History
            </NavLink>
            <NavLink to="/incidents" className={link}>
              Incidents
            </NavLink>
            <NavLink to="/assets" className={link}>
              Assets
            </NavLink>
            {isAdmin && (
              <NavLink to="/inspections" className={link}>
                Checklists
              </NavLink>
            )}
            <NavLink to="/masterdata" className={link}>
              Masterdata
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={link}>
                Admin
              </NavLink>
            )}
          </nav>
          <CurrentUserBadge />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
