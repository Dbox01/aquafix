import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAssets, useDeleteAsset } from '../hooks';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { EmptyState } from '@/components/ui/EmptyState';

/** Replaces the Assets portion of Mendix Masterdata_Overview. */
export function AssetListPage() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data, isPending, error } = useAssets(includeInactive);
  const del = useDeleteAsset();
  const { canDelete } = useCurrentUser();

  // Client-side filter: asset counts here are in the hundreds, not millions.
  // If that changes, move it to a server-side ilike.
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) ||
        a.code?.toLowerCase().includes(q) ||
        a.location_name?.toLowerCase().includes(q) ||
        a.asset_type_name?.toLowerCase().includes(q),
    );
  }, [data, search]);

  if (isPending) return <Spinner label="Loading assets…" />;
  if (error) return <ErrorBox error={error} />;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Assets</h1>
        <Link to="/assets/new">
          <Button>New asset</Button>
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, code, location…"
          className="touch-target min-w-[16rem] flex-1 rounded-md border-0 px-3 py-2 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Show inactive
        </label>
      </div>

      {del.error && <ErrorBox error={del.error} />}

      {filtered.length === 0 ? (
        <EmptyState
          title={data.length === 0 ? 'No assets yet.' : 'No assets match that search.'}
          hint={data.length === 0 ? 'Assets are the things your team inspects — pumps, valves, tanks.' : undefined}
          action={data.length === 0 ? <Link to="/assets/new"><Button>Add the first asset</Button></Link> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Last inspected</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <Link to={`/assets/${a.id}`} className="font-medium text-brand-700 hover:underline">
                      {a.name}
                    </Link>
                    {a.code && <span className="ml-2 text-xs text-slate-500">{a.code}</span>}
                    {!a.active && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.asset_type_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{a.location_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.last_inspection_date
                      ? new Date(a.last_inspection_date).toLocaleDateString()
                      : <span className="text-slate-400">Never</span>}
                    {(a.inspection_count ?? 0) > 0 && (
                      <span className="ml-2 text-xs text-slate-400">({a.inspection_count})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-2">
                      <Link to={`/inspect/${a.id}`}>
                        <Button variant="secondary">Inspect</Button>
                      </Link>
                      {/* Hidden for non-admins as a nicety. The RLS policy is the security. */}
                      {canDelete &&
                        (pendingDelete === a.id ? (
                          <>
                            <span className="text-xs text-slate-500">Delete?</span>
                            <Button
                              variant="danger"
                              disabled={del.isPending}
                              onClick={() => del.mutate(a.id!, { onSettled: () => setPendingDelete(null) })}
                            >
                              Yes
                            </Button>
                            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
                              No
                            </Button>
                          </>
                        ) : (
                          <Button variant="secondary" onClick={() => setPendingDelete(a.id!)}>
                            Delete
                          </Button>
                        ))}
                    </span>
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
