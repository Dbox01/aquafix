import { Link } from 'react-router-dom';
import { useRecentActivities } from '../hooks';
import { useGradings } from '@/features/lookups/hooks';
import { GradingBadge } from '@/components/ui/GradingBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

type Row = {
  id: string;
  inspection_date: string;
  notes: string | null;
  asset: { name: string; code: string | null } | null;
  grading: { name: string; priority: number } | null;
  performer: { full_name: string | null; email: string } | null;
};

/** Replaces the history half of Mendix Inspection_Overview. */
export function ActivityListPage() {
  const { data, isPending, error } = useRecentActivities();
  const gradings = useGradings();
  const maxPriority = gradings.data?.reduce((m, g) => Math.max(m, g.priority ?? 0), 0) ?? null;

  if (isPending) return <Spinner label="Loading inspections…" />;
  if (error) return <ErrorBox error={error} />;

  const rows = (data ?? []) as unknown as Row[];

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Inspections</h1>
        <Link to="/inspect">
          <Button>New inspection</Button>
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="No inspections recorded yet."
          hint="Pick an asset and record the first one."
          action={<Link to="/inspect"><Button>Start an inspection</Button></Link>}
        />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg bg-white shadow-sm">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/activities/${r.id}`} className="flex touch-target items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{r.asset?.name ?? 'Unknown asset'}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {new Date(r.inspection_date).toLocaleString()} ·{' '}
                    {r.performer?.full_name ?? r.performer?.email ?? 'Unknown user'}
                  </span>
                </span>
                <GradingBadge name={r.grading?.name} priority={r.grading?.priority} maxPriority={maxPriority} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
