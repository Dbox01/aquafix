import { supabase } from '@/lib/supabase';
import { deleteRow, rethrowSaveError } from '@/lib/crud';
import type { AssetType } from '@/lib/database.types';
import type { AssetTypeValues } from './schema';

// Explicit columns, never select('*') — it breaks silently when the schema
// moves and over-fetches on mobile. (CLAUDE.md, Frontend rules)
const COLUMNS = 'id, name, active, created_at, updated_at';

export async function listAssetTypes(includeInactive: boolean): Promise<AssetType[]> {
  let query = supabase.from('asset_type').select(COLUMNS).order('name');
  if (!includeInactive) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getAssetType(id: string): Promise<AssetType> {
  const { data, error } = await supabase.from('asset_type').select(COLUMNS).eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createAssetType(values: AssetTypeValues): Promise<AssetType> {
  const { data, error } = await supabase.from('asset_type').insert(values).select(COLUMNS).single();
  if (error) rethrowSaveError(error);
  return data!;
}

export async function updateAssetType(id: string, values: AssetTypeValues): Promise<AssetType> {
  const { data, error } = await supabase
    .from('asset_type')
    .update(values)
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) rethrowSaveError(error);
  return data!;
}

/** Goes through deleteRow so a silent RLS refusal surfaces as an error. */
export async function deleteAssetType(id: string): Promise<void> {
  await deleteRow('asset_type', id);
}

/** Case- and whitespace-insensitive availability check, matching the unique index. */
export async function isAssetTypeNameAvailable(name: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('asset_type').select('id').ilike('name', name.trim());
  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) === 0;
}
