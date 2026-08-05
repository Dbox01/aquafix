import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDeleteLocation, useLocations } from '../hooks';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Replaces the Locations tab of Mendix Masterdata_Overview.
 *
 * Defaults to active only — `active = false` means "retired, don't offer in
 * pickers", not "deleted". (docs/specs/01-locationdassettype.md §3)
 */
export function LocationListPage() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data, isPending, error } = useLocations(includeInactive);
  const del = useDeleteLocation();
  const { canDelete } = useCurrentUser();

  if (isPending) return <Spinner label="Loading locations…" />;
  if (error) return <ErrorBox error={error} />;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Locations</h1>
        <Link to="/masterdata/locations/new">
          <Button>New location</Button>
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
        <p className="rounded-md bg-white p-6 text-center text-sm text-slate-500">
          No locations yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((loc) => (
                <tr key={loc.id}>
                  <td className="px-4 py-3">
                    <Link
                      to={`/masterdata/locations/${loc.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {loc.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        loc.active
                          ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700'
                          : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500'
                      }
                    >
                      {loc.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Hiding this is a UX nicety. The RLS policy is the security. */}
                    {canDelete &&
                      (pendingDelete === loc.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-slate-500">Delete?</span>
                          <Button
                            variant="danger"
                            disabled={del.isPending}
                            onClick={() => del.mutate(loc.id, { onSettled: () => setPendingDelete(null) })}
                          >
                            Yes
                          </Button>
                          <Button variant="secondary" onClick={() => setPendingDelete(null)}>
                            No
                          </Button>
                        </span>
                      ) : (
                        <Button variant="secondary" onClick={() => setPendingDelete(loc.id)}>
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

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
      {message}
    </p>
  );
}
