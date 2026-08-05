import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAsset, useSaveAsset } from '../hooks';
import { isAssetNameAvailable } from '../api';
import { assetDefaults, assetSchema, type AssetValues } from '../schema';
import { useAssetTypeOptions, useLocationOptions } from '@/features/lookups/hooks';
import { DuplicateNameError } from '@/lib/crud';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';

/** Replaces Mendix Asset_NewEdit. */
export function AssetEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const { data, isPending } = useAsset(id);
  const save = useSaveAsset(id);
  const types = useAssetTypeOptions();
  const locations = useLocationOptions();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AssetValues>({ resolver: zodResolver(assetSchema), defaultValues: assetDefaults });

  useEffect(() => {
    if (data) {
      reset({
        name: data.name,
        code: data.code ?? '',
        asset_type_id: data.asset_type_id ?? '',
        location_id: data.location_id ?? '',
        purchase_date: data.purchase_date ?? '',
        active: data.active,
      });
    }
  }, [data, reset]);

  if (!isNew && isPending) return <Spinner label="Loading asset…" />;

  async function onSubmit(values: AssetValues) {
    // Friendly pre-check. It can't prevent a simultaneous double-submit, which
    // is why the unique-violation catch below exists too.
    const available = await isAssetNameAvailable(values.name, isNew ? undefined : id);
    if (!available) {
      setError('name', { message: 'An asset with that name already exists.' });
      return;
    }
    try {
      await save.mutateAsync(values);
      navigate('/assets');
    } catch (err) {
      if (err instanceof DuplicateNameError) {
        setError('name', { message: 'An asset with that name already exists.' });
        return;
      }
      throw err;
    }
  }

  const noMasterdata = types.data?.length === 0 || locations.data?.length === 0;

  return (
    <section className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">{isNew ? 'New asset' : 'Edit asset'}</h1>

      {noMasterdata && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          An asset needs an asset type and a location. Add those under{' '}
          <a href="#/masterdata" className="font-medium underline">Masterdata</a> first.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
        <Input label="Name" autoFocus {...register('name')} error={errors.name?.message} />
        <Input label="Code" placeholder="Optional reference" {...register('code')} error={errors.code?.message} />

        <Select
          label="Asset type"
          placeholder="Select…"
          options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          {...register('asset_type_id')}
          error={errors.asset_type_id?.message}
        />
        <Select
          label="Location"
          placeholder="Select…"
          options={(locations.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
          {...register('location_id')}
          error={errors.location_id?.message}
        />

        <Input label="Purchase date" type="date" {...register('purchase_date')} error={errors.purchase_date?.message} />

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" {...register('active')} className="h-4 w-4 rounded border-slate-300" />
          Active
          <span className="text-xs text-slate-500">(inactive assets are hidden from inspection lists)</span>
        </label>

        {save.error && !(save.error instanceof DuplicateNameError) && <ErrorBox error={save.error} />}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/assets')}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
