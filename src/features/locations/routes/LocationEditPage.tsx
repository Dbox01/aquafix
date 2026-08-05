import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useSaveLocation } from '../hooks';
import { isLocationNameAvailable } from '../api';
import { locationDefaults, locationSchema, type LocationValues } from '../schema';
import { DuplicateNameError } from '@/lib/crud';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from './LocationListPage';

/** Replaces Mendix Location_NewEdit. `:id` is 'new' when creating. */
export function LocationEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const { data, isPending } = useLocation(id);
  const save = useSaveLocation(id);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LocationValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: locationDefaults,
  });

  useEffect(() => {
    if (data) reset({ name: data.name, active: data.active });
  }, [data, reset]);

  if (!isNew && isPending) return <Spinner label="Loading location…" />;

  async function onSubmit(values: LocationValues) {
    // Friendly pre-check. It cannot prevent a simultaneous double-submit, which
    // is why the unique-violation catch below also exists.
    const available = await isLocationNameAvailable(values.name, isNew ? undefined : id);
    if (!available) {
      setError('name', { message: 'A location with that name already exists.' });
      return;
    }

    try {
      await save.mutateAsync(values);
      navigate('/masterdata/locations');
    } catch (err) {
      if (err instanceof DuplicateNameError) {
        setError('name', { message: 'A location with that name already exists.' });
        return;
      }
      throw err;
    }
  }

  return (
    <section className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">{isNew ? 'New location' : 'Edit location'}</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
        <Input label="Name" autoFocus {...register('name')} error={errors.name?.message} />

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" {...register('active')} className="h-4 w-4 rounded border-slate-300" />
          Active
          <span className="text-xs text-slate-500">(inactive locations are hidden from pickers)</span>
        </label>

        {save.error && !(save.error instanceof DuplicateNameError) && <ErrorBox error={save.error} />}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/masterdata/locations')}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
