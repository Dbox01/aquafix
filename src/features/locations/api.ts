import { supabase } from '@/lib/supabase';
import { deleteRow, rethrowSaveError } from '@/lib/crud';
import type { Location } from '@/lib/database.types';
import type { LocationValues } from './schema';

// Explicit columns, never select('*') — it breaks silently when the schema
// moves and over-fetches on mobile. (CLAUDE.md, Frontend rules)
const COLUMNS = 'id, name, active, created_at, updated_at';

export async function listLocations(includeInactive: boolean): Promise<Location[]> {
  let query = supabase.from('location').select(COLUMNS).order('name');
  if (!includeInactive) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getLocation(id: string): Promise<Location> {
  const { data, error } = await supabase.from('location').select(COLUMNS).eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createLocation(values: LocationValues): Promise<Location> {
  const { data, error } = await supabase.from('location').insert(values).select(COLUMNS).single();
  if (error) rethrowSaveError(error);
  return data!;
}

export async function updateLocation(id: string, values: LocationValues): Promise<Location> {
  const { data, error } = await supabase
    .from('location')
    .update(values)
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) rethrowSaveError(error);
  return data!;
}

/** Goes through deleteRow so a silent RLS refusal surfaces as an error. */
export async function deleteLocation(id: string): Promise<void> {
  await deleteRow('location', id);
}

/** Case- and whitespace-insensitive availability check, matching the unique index. */
export async function isLocationNameAvailable(name: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('location').select('id').ilike('name', name.trim());
  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) === 0;
}
