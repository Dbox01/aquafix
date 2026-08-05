import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAssetForCapture, useInspectionsForAssetType, useSaveInspection } from '../hooks';
import { hasAnswer, ReadingInput } from '../components/ReadingInput';
import type { CaptureReading } from '../api';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Replaces Mendix Inspection_NewEdit_PWA — the screen the whole app exists for.
 *
 * Grading is not computed here. The readings go up, a database trigger resolves
 * each grading and rolls the worst one up to the activity, and the result is
 * read back (ADR-006). The phone never decides what a reading means.
 */
export function InspectCapturePage() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const { userId } = useCurrentUser();

  const asset = useAssetForCapture(assetId);
  const checklist = useInspectionsForAssetType(asset.data?.asset_type_id);
  const save = useSaveInspection();

  const [readings, setReadings] = useState<Record<string, CaptureReading>>({});
  const [notes, setNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  // Seed one blank reading per inspection once the checklist arrives.
  useEffect(() => {
    if (!checklist.data) return;
    setReadings((prev) => {
      const next: Record<string, CaptureReading> = {};
      for (const i of checklist.data!) {
        next[i.id] = prev[i.id] ?? { inspection_id: i.id, value_type: i.value_type };
      }
      return next;
    });
  }, [checklist.data]);

  const missing = useMemo(() => {
    if (!checklist.data) return [];
    return checklist.data.filter((i) => i.is_required && !hasAnswer(readings[i.id] ?? { inspection_id: i.id, value_type: i.value_type }));
  }, [checklist.data, readings]);

  if (asset.isPending) return <Spinner label="Loading asset…" />;
  if (asset.error) return <ErrorBox error={asset.error} />;

  const a = asset.data!;

  async function onSubmit() {
    setShowErrors(true);
    if (missing.length > 0) {
      document.getElementById(`inspection-${missing[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Unanswered optional inspections are not sent at all. A row of all-nulls
    // is not "no reading" — it is a reading the grading engine would have to
    // interpret, and it would show up in history as a blank line.
    const answered = Object.values(readings).filter(hasAnswer);
    const result = await save.mutateAsync({
      assetId: assetId!,
      performedBy: userId,
      readings: answered,
      notes,
    });
    navigate(`/activities/${result.id}`, { replace: true });
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{a.name}</h1>
        <p className="text-sm text-slate-600">
          {[a.code, a.asset_type_name, a.location_name].filter(Boolean).join(' · ') || 'No details'}
        </p>
      </header>

      {checklist.isPending && a.asset_type_id && <Spinner label="Loading checklist…" />}
      {checklist.error && <ErrorBox error={checklist.error} />}

      {!a.asset_type_id && (
        <EmptyState
          title="This asset has no asset type."
          hint="Inspections are allocated to asset types. Set a type on the asset first."
          action={<Link to={`/assets/${a.id}`}><Button>Edit asset</Button></Link>}
        />
      )}

      {a.asset_type_id && checklist.data?.length === 0 && (
        <EmptyState
          title={`No inspections are allocated to “${a.asset_type_name ?? 'this type'}”.`}
          hint="Allocate inspections to this asset type and they will appear here."
          action={<Link to="/inspections"><Button>Manage inspections</Button></Link>}
        />
      )}

      {(checklist.data?.length ?? 0) > 0 && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          {checklist.data!.map((i) => {
            const reading = readings[i.id] ?? { inspection_id: i.id, value_type: i.value_type };
            const isMissing = showErrors && i.is_required && !hasAnswer(reading);
            return (
              <div key={i.id} id={`inspection-${i.id}`} className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
                <div>
                  <label className="text-base font-medium text-slate-900">
                    {i.name}
                    {i.is_required && <span className="ml-1 text-red-600" aria-hidden>*</span>}
                  </label>
                  {i.description && <p className="text-sm text-slate-500">{i.description}</p>}
                </div>
                <ReadingInput
                  inspection={i}
                  reading={reading}
                  error={isMissing ? 'Required' : undefined}
                  onChange={(patch) =>
                    setReadings((prev) => ({ ...prev, [i.id]: { ...prev[i.id], ...patch } }))
                  }
                />
                {isMissing && <p className="text-sm text-red-600">This reading is required.</p>}
              </div>
            );
          })}

          <div className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
            <label htmlFor="activity-notes" className="text-base font-medium text-slate-900">
              Notes
            </label>
            <textarea
              id="activity-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the readings don't capture"
              className="block w-full rounded-md border-0 px-3 py-3 text-base ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
            />
          </div>

          {save.error && <ErrorBox error={save.error} />}
          {showErrors && missing.length > 0 && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {missing.length} required {missing.length === 1 ? 'reading is' : 'readings are'} still empty.
            </p>
          )}

          <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-slate-50 py-3">
            <Button type="submit" disabled={save.isPending} className="flex-1">
              {save.isPending ? 'Saving…' : 'Submit inspection'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
