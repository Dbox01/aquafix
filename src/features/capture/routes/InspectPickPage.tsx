import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAssets } from '@/features/assets/hooks';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

/**
 * Replaces Mendix Inspection_Overview_PWA — pick the asset you are standing in
 * front of. Only active assets: you do not inspect something that has been
 * decommissioned.
 */
export function InspectPickPage() {
  const [search, setSearch] = useState('');
  const { data, isPending, error } = useAssets(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data;
    return data.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) ||
        a.code?.toLowerCase().includes(q) ||
        a.location_name?.toLowerCase().includes(q),
    );
  }, [data, search]);

  if (isPending) return <Spinner label="Loading assets…" />;
  if (error) return <ErrorBox error={error} />;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Start an inspection</h1>
      <p className="text-sm text-slate-600">Choose the asset you are inspecting.</p>

      <input
        type="search"
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, code or location…"
        className="touch-target block w-full rounded-md border-0 px-3 py-3 text-base ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={data.length === 0 ? 'No active assets yet.' : 'Nothing matches that search.'}
          hint={data.length === 0 ? 'Add assets before inspecting them.' : undefined}
          action={data.length === 0 ? <Link to="/assets/new"><Button>Add an asset</Button></Link> : undefined}
        />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg bg-white shadow-sm">
          {filtered.map((a) => (
            <li key={a.id}>
              <Link
                to={`/inspect/${a.id}`}
                className="flex touch-target items-center justify-between gap-3 px-4 py-4 hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{a.name}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {[a.code, a.asset_type_name, a.location_name].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {a.last_inspection_date
                    ? `Last ${new Date(a.last_inspection_date).toLocaleDateString()}`
                    : 'Never inspected'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
