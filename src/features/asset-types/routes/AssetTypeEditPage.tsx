import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAssetType, useSaveAssetType } from '../hooks';
import { isAssetTypeNameAvailable } from '../api';
import { assetTypeDefaults, assetTypeSchema, type AssetTypeValues } from '../schema';
import { DuplicateNameError } from '@/lib/crud';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from './AssetTypeListPage';

/** Replaces Mendix AssetType_NewEdit. `:id` is 'new' when creating. */
export function AssetTypeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const { data, isPending } = useAssetType(id);
  const save = useSaveAssetType(id);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AssetTypeValues>({
    resolver: zodResolver(assetTypeSchema),
    defaultValues: assetTypeDefaults,
  });

  useEffect(() => {
    if (data) reset({ name: data.name, active: data.active });
  }, [data, reset]);

  if (!isNew && isPending) return <Spinner label="Loading asset type…" />;

  async function onSubmit(values: AssetTypeValues) {
    // Friendly pre-check. It cannot prevent a simultaneous double-submit, which
    // is why the unique-violation catch below also exists.
    const available = await isAssetTypeNameAvailable(values.name, isNew ? undefined : id);
    if (!available) {
      setError('name', { message: 'An asset type with that name already exists.' });
      return;
    }

    try {
      await save.mutateAsync(values);
      navigate('/masterdata/asset-types');
    } catch (err) {
      if (err instanceof DuplicateNameError) {
        setError('name', { message: 'An asset type with that name already exists.' });
        return;
      }
      throw err;
    }
  }

  return (
    <section className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">{isNew ? 'New asset type' : 'Edit asset type'}</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
        <Input label="Name" autoFocus {...register('name')} error={errors.name?.message} />

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" {...register('active')} className="h-4 w-4 rounded border-slate-300" />
          Active
          <span className="text-xs text-slate-500">(inactive asset types are hidden from pickers)</span>
        </label>

        {save.error && !(save.error instanceof DuplicateNameError) && <ErrorBox error={save.error} />}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/masterdata/asset-types')}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
