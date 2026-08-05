import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useIncident, useSaveIncident, useDeleteIncident } from '../hooks';
import { incidentDefaults, incidentSchema, type IncidentValues } from '../schema';
import { useIncidentTypeOptions, useLocationOptions } from '@/features/lookups/hooks';
import { useAssets } from '@/features/assets/hooks';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { INCIDENT_STATUS_LABELS } from '@/lib/database.types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';

/** Replaces Mendix Incident_NewEdit and Incident_NewEdit_PWA. */
export function IncidentEditPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const { userId, canDelete } = useCurrentUser();
  const { data, isPending } = useIncident(id);
  const save = useSaveIncident(id, userId);
  const del = useDeleteIncident();

  const types = useIncidentTypeOptions();
  const locations = useLocationOptions();
  const assets = useAssets(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<IncidentValues>({
    resolver: zodResolver(incidentSchema),
    // Reporting from an asset screen pre-fills the asset, so a field worker
    // standing at a broken pump does not have to find it in a list.
    defaultValues: { ...incidentDefaults, asset_id: params.get('asset') ?? '' },
  });

  useEffect(() => {
    if (data) {
      reset({
        incident_type_id: data.incident_type_id ?? '',
        location_id: data.location_id ?? '',
        asset_id: data.asset_id ?? '',
        status: data.status,
        comment: data.comment ?? '',
      });
    }
  }, [data, reset]);

  if (!isNew && isPending) return <Spinner label="Loading incident…" />;

  const status = watch('status');

  async function onSubmit(values: IncidentValues) {
    await save.mutateAsync(values);
    navigate('/incidents');
  }

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">{isNew ? 'Report an incident' : 'Incident'}</h1>

      {types.data?.length === 0 && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          No incident types are configured yet. An admin needs to add them before incidents can be reported.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
        <Select
          label="What happened?"
          placeholder="Select…"
          options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          {...register('incident_type_id')}
          error={errors.incident_type_id?.message}
        />

        <div className="space-y-1">
          <label htmlFor="incident-comment" className="block text-sm font-medium text-slate-700">
            Details
          </label>
          <textarea
            id="incident-comment"
            rows={4}
            {...register('comment')}
            placeholder="What is wrong, and where exactly?"
            className="block w-full rounded-md border-0 px-3 py-3 text-base ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
          />
          {errors.comment && <p className="text-sm text-red-600">{errors.comment.message}</p>}
        </div>

        <Select
          label="Location"
          placeholder="Not specified"
          options={(locations.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
          {...register('location_id')}
        />
        <Select
          label="Asset"
          placeholder="Not specified"
          options={(assets.data ?? []).map((a) => ({ value: a.id!, label: a.name! }))}
          {...register('asset_id')}
        />
        <Select
          label="Status"
          options={Object.entries(INCIDENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          {...register('status')}
        />
        {status === 'completed' && (
          <p className="text-xs text-slate-500">Saving will stamp this incident as completed now.</p>
        )}

        {save.error && <ErrorBox error={save.error} />}
        {del.error && <ErrorBox error={del.error} />}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/incidents')}>
            Cancel
          </Button>
          {!isNew && canDelete && (
            <Button
              type="button"
              variant="danger"
              disabled={del.isPending}
              onClick={() => del.mutate(id!, { onSuccess: () => navigate('/incidents') })}
            >
              Delete
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
