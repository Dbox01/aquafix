import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useIncidents } from '../hooks';
import { INCIDENT_STATUS_LABELS, type IncidentStatus } from '@/lib/database.types';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { EmptyState } from '@/components/ui/EmptyState';

const FILTERS: { key: 'open' | 'all' | IncidentStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

const STATUS_TONE: Record<IncidentStatus, string> = {
  new: 'bg-red-50 text-red-700',
  in_progress: 'bg-amber-50 text-amber-800',
  completed: 'bg-emerald-50 text-emerald-700',
};

/** Replaces Mendix Incident_Overview and Incident_Overview_PWA. */
export function IncidentListPage() {
  const [filter, setFilter] = useState<'open' | 'all' | IncidentStatus>('open');
  const { data, isPending, error } = useIncidents(filter);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Incidents</h1>
        <Link to="/incidents/new">
          <Button>Report an incident</Button>
        </Link>
      </header>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`touch-target rounded-md px-3 py-2 text-sm font-medium ${
              filter === f.key ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isPending && <Spinner label="Loading incidents…" />}
      {error && <ErrorBox error={error} />}

      {data && (data.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'No open incidents.' : 'Nothing here.'}
          hint="An incident is something wrong that needs following up — a leak, damage, a hazard."
          action={<Link to="/incidents/new"><Button>Report an incident</Button></Link>}
        />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg bg-white shadow-sm">
          {data.map((i) => (
            <li key={i.id}>
              <Link to={`/incidents/${i.id}`} className="flex touch-target items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">
                    {i.incident_type?.name ?? 'Incident'}
                  </span>
                  <span className="block truncate text-sm text-slate-600">{i.comment}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {new Date(i.incident_date).toLocaleString()}
                    {i.asset?.name ? ` · ${i.asset.name}` : ''}
                    {i.location?.name ? ` · ${i.location.name}` : ''}
                    {i.reporter ? ` · ${i.reporter.full_name ?? i.reporter.email}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[i.status]}`}>
                  {INCIDENT_STATUS_LABELS[i.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
