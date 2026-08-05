import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createIncidentType,
  deleteIncidentType,
  listIncidentTypes,
  updateIncidentType,
} from '../api';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { queryKeys } from '@/lib/queryClient';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';

const KEY = ['incidentTypes', 'list'] as const;

/**
 * Replaces the IncidentType portion of Mendix Masterdata_Overview.
 *
 * Edited inline rather than on a separate page: the entity has one meaningful
 * field, and a full-page form for a single text input is friction, not rigour.
 */
export function IncidentTypeListPage() {
  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const { canDelete } = useCurrentUser();

  const list = useQuery({ queryKey: [...KEY, includeInactive], queryFn: () => listIncidentTypes(includeInactive) });

  function invalidate() {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: queryKeys.lookups.incidentTypes });
  }

  const add = useMutation({ mutationFn: createIncidentType, onSuccess: () => { setNewName(''); invalidate(); } });
  const patch = useMutation({
    mutationFn: (v: { id: string; name?: string; active?: boolean }) => updateIncidentType(v.id, v),
    onSuccess: () => { setEditing(null); invalidate(); },
  });
  const remove = useMutation({ mutationFn: deleteIncidentType, onSuccess: invalidate });

  if (list.isPending) return <Spinner label="Loading incident types…" />;
  if (list.error) return <ErrorBox error={list.error} />;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Incident types</h1>
        <p className="text-sm text-slate-600">The categories a field worker picks from when reporting.</p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) add.mutate(newName);
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New incident type"
          className="touch-target min-w-[14rem] flex-1 rounded-md border-0 px-3 py-2 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
        />
        <Button type="submit" disabled={add.isPending || !newName.trim()}>
          Add
        </Button>
      </form>

      {add.error && <ErrorBox error={add.error} />}
      {patch.error && <ErrorBox error={patch.error} />}
      {remove.error && <ErrorBox error={remove.error} />}

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Show inactive
      </label>

      {list.data.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          None yet. Add one above.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg bg-white shadow-sm">
          {list.data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              {editing?.id === t.id ? (
                <>
                  <input
                    autoFocus
                    value={editing.name}
                    onChange={(e) => setEditing({ id: t.id, name: e.target.value })}
                    className="min-w-[12rem] flex-1 rounded-md border-0 px-3 py-2 ring-1 ring-inset ring-slate-300"
                  />
                  <Button
                    disabled={patch.isPending}
                    onClick={() => patch.mutate({ id: t.id, name: editing.name.trim() })}
                  >
                    Save
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium text-slate-900">
                    {t.name}
                    {!t.active && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>
                    )}
                  </span>
                  <Button variant="secondary" onClick={() => setEditing({ id: t.id, name: t.name })}>
                    Rename
                  </Button>
                  <Button variant="secondary" onClick={() => patch.mutate({ id: t.id, active: !t.active })}>
                    {t.active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                  {canDelete && (
                    <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(t.id)}>
                      Delete
                    </Button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
