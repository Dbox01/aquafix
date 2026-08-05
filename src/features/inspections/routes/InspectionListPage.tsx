import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDeleteInspection, useInspections } from '../hooks';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { VALUE_TYPE_LABELS } from '@/lib/database.types';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { EmptyState } from '@/components/ui/EmptyState';

/** Replaces Mendix Inspection_Overview (the definition half, not the history). */
export function InspectionListPage() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { data, isPending, error } = useInspections(includeInactive);
  const del = useDeleteInspection();
  const { canDelete } = useCurrentUser();

  if (isPending) return <Spinner label="Loading inspections…" />;
  if (error) return <ErrorBox error={error} />;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inspection definitions</h1>
          <p className="text-sm text-slate-600">
            What gets checked, which assets it applies to, and how each answer is graded.
          </p>
        </div>
        <Link to="/inspections/new">
          <Button>New inspection</Button>
        </Link>
      </header>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Show inactive
      </label>

      {del.error && <ErrorBox error={del.error} />}

      {data.length === 0 ? (
        <EmptyState
          title="No inspections defined yet."
          hint="An inspection is one thing a field worker checks — a pressure reading, a yes/no condition."
          action={<Link to="/inspections/new"><Button>Define the first inspection</Button></Link>}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Inspection</th>
                <th className="px-4 py-3 font-medium">Answer type</th>
                <th className="px-4 py-3 font-medium">Required</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3">
                    <Link to={`/inspections/${i.id}`} className="font-medium text-brand-700 hover:underline">
                      {i.name}
                    </Link>
                    {!i.active && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>
                    )}
                    {i.description && <p className="text-xs text-slate-500">{i.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{VALUE_TYPE_LABELS[i.value_type]}</td>
                  <td className="px-4 py-3 text-slate-600">{i.is_required ? 'Yes' : 'Optional'}</td>
                  <td className="px-4 py-3 text-right">
                    {canDelete &&
                      (pendingDelete === i.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-slate-500">Delete?</span>
                          <Button
                            variant="danger"
                            disabled={del.isPending}
                            onClick={() => del.mutate(i.id, { onSettled: () => setPendingDelete(null) })}
                          >
                            Yes
                          </Button>
                          <Button variant="secondary" onClick={() => setPendingDelete(null)}>
                            No
                          </Button>
                        </span>
                      ) : (
                        <Button variant="secondary" onClick={() => setPendingDelete(i.id)}>
                          Delete
                        </Button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
