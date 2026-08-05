import { NavLink, Outlet } from 'react-router-dom';

/**
 * Replaces Mendix Masterdata_Overview. Tabbed; slice 1 adds two tabs.
 * Slices 2-4 add Assets, Inspections, Gradings.
 */
export function MasterdataPage() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `touch-target inline-flex items-center border-b-2 px-4 py-2 text-sm font-medium ${
      isActive ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-700'
    }`;

  return (
    <div className="space-y-6">
      <nav className="flex gap-2 border-b border-slate-200">
        <NavLink to="/masterdata/locations" className={tab}>Locations</NavLink>
        <NavLink to="/masterdata/asset-types" className={tab}>Asset types</NavLink>
        <NavLink to="/masterdata/incident-types" className={tab}>Incident types</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
