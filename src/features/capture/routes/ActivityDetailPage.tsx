import { Link, useParams } from 'react-router-dom';
import { useActivityResult } from '../hooks';
import { useGradings } from '@/features/lookups/hooks';
import { GradingBadge } from '@/components/ui/GradingBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Button } from '@/components/ui/Button';

/**
 * The result screen: what the database decided about the readings just saved.
 *
 * Nothing here is computed client-side. If the grade shown is wrong, the fix is
 * in the grading rules or in resolve_grading(), never in this file.
 */
export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, error } = useActivityResult(id);
  const gradings = useGradings();

  const maxPriority = gradings.data?.reduce((m, g) => Math.max(m, g.priority ?? 0), 0) ?? null;

  if (isPending) return <Spinner label="Loading result…" />;
  if (error) return <ErrorBox error={error} />;

  const a = data!;

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Inspection recorded</h1>
        <GradingBadge name={a.grading_name} priority={a.grading_priority} maxPriority={maxPriority} />
      </header>

      {a.values.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-sm text-slate-500 shadow-sm">No readings were recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg bg-white shadow-sm">
          {a.values.map((v, idx) => (
            <li key={idx} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">{v.inspection_name}</span>
                <span className="block truncate text-sm text-slate-600">{v.display}</span>
              </span>
              <GradingBadge name={v.grading_name} priority={v.grading_priority} maxPriority={maxPriority} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-500">
        The overall grade is the worst individual reading. Grades come from the grading rules configured
        for each inspection.
      </p>

      <div className="flex gap-2">
        <Link to="/inspect">
          <Button>Inspect another asset</Button>
        </Link>
        <Link to="/activities">
          <Button variant="secondary">All inspections</Button>
        </Link>
      </div>
    </section>
  );
}
