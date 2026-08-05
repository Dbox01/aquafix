import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { useRecentActivities } from '@/features/capture/hooks';
import { useIncidents } from '@/features/incidents/hooks';
import { useGradings } from '@/features/lookups/hooks';
import { GradingBadge } from '@/components/ui/GradingBadge';
import { Button } from '@/components/ui/Button';

/** Replaces Mendix Home_Web and Home_PWA — one responsive page (ADR-007). */
export function HomePage() {
  const { fullName, email, isAdmin } = useCurrentUser();
  const activities = useRecentActivities(5);
  const openIncidents = useIncidents('open');
  const gradings = useGradings();
  const maxPriority = gradings.data?.reduce((m, g) => Math.max(m, g.priority ?? 0), 0) ?? null;

  type Row = {
    id: string;
    inspection_date: string;
    asset: { name: string } | null;
    grading: { name: string; priority: number } | null;
  };
  const recent = (activities.data ?? []) as unknown as Row[];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Hello, {fullName ?? email}</h1>
        <p className="text-sm text-slate-600">What would you like to do?</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/inspect"
          className="rounded-lg bg-brand-700 p-6 text-white shadow-sm transition hover:bg-brand-800"
        >
          <span className="block text-lg font-semibold">Start an inspection</span>
          <span className="mt-1 block text-sm text-white/80">Pick an asset and record your readings.</span>
        </Link>
        <Link
          to="/incidents/new"
          className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
        >
          <span className="block text-lg font-semibold text-slate-900">Report an incident</span>
          <span className="mt-1 block text-sm text-slate-600">Something is wrong and needs following up.</span>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-slate-900">Recent inspections</h2>
            <Link to="/activities" className="text-sm text-brand-700 hover:underline">
              See all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg bg-white shadow-sm">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/activities/${r.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {r.asset?.name ?? 'Unknown asset'}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {new Date(r.inspection_date).toLocaleString()}
                      </span>
                    </span>
                    <GradingBadge name={r.grading?.name} priority={r.grading?.priority} maxPriority={maxPriority} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-slate-900">Open incidents</h2>
            <Link to="/incidents" className="text-sm text-brand-700 hover:underline">
              See all
            </Link>
          </div>
          {(openIncidents.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">Nothing open. Good.</p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg bg-white shadow-sm">
              {(openIncidents.data ?? []).slice(0, 5).map((i) => (
                <li key={i.id}>
                  <Link to={`/incidents/${i.id}`} className="block px-4 py-3 hover:bg-slate-50">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {i.incident_type?.name ?? 'Incident'}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{i.comment}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="font-medium text-slate-900">Setting things up</h2>
          <p className="mt-1 text-sm text-slate-600">
            Assets are inspected using the checklist attached to their asset type. Define the checks
            under Checklists, then allocate each one to the asset types it applies to.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/inspections"><Button variant="secondary">Checklists</Button></Link>
            <Link to="/assets"><Button variant="secondary">Assets</Button></Link>
            <Link to="/masterdata"><Button variant="secondary">Masterdata</Button></Link>
          </div>
        </div>
      )}
    </section>
  );
}
