import { supabase } from '@/lib/supabase';
import { deleteRow, rethrowSaveError } from '@/lib/crud';
import type { Asset, AssetOverview } from '@/lib/database.types';
import type { AssetValues } from './schema';

const COLUMNS = 'id, name, code, asset_type_id, location_id, purchase_date, active, created_at, updated_at';

/**
 * Reads go through asset_overview, which carries the asset type and location
 * names plus last_inspection_date. That last field replaces Mendix's
 * Asset._LastInspectionDate, which a microflow maintained and which could drift.
 */
/** The columns the list screen actually reads — a subset of the view. */
export type AssetListRow = Pick<
  AssetOverview,
  | 'id'
  | 'name'
  | 'code'
  | 'active'
  | 'asset_type_id'
  | 'asset_type_name'
  | 'location_id'
  | 'location_name'
  | 'purchase_date'
  | 'last_inspection_date'
  | 'inspection_count'
>;

export async function listAssets(includeInactive: boolean): Promise<AssetListRow[]> {
  let query = supabase
    .from('asset_overview')
    .select('id, name, code, active, asset_type_id, asset_type_name, location_id, location_name, purchase_date, last_inspection_date, inspection_count')
    .order('name');
  if (!includeInactive) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getAsset(id: string): Promise<Asset> {
  const { data, error } = await supabase.from('asset').select(COLUMNS).eq('id', id).single();
  if (error) throw error;
  return data;
}

/** Empty strings from the form become null, not '' — a blank date is not a date. */
function toRow(values: AssetValues) {
  return {
    name: values.name,
    code: values.code || null,
    asset_type_id: values.asset_type_id,
    location_id: values.location_id,
    purchase_date: values.purchase_date || null,
    active: values.active,
  };
}

export async function createAsset(values: AssetValues): Promise<Asset> {
  const { data, error } = await supabase.from('asset').insert(toRow(values)).select(COLUMNS).single();
  if (error) rethrowSaveError(error);
  return data!;
}

export async function updateAsset(id: string, values: AssetValues): Promise<Asset> {
  const { data, error } = await supabase.from('asset').update(toRow(values)).eq('id', id).select(COLUMNS).single();
  if (error) rethrowSaveError(error);
  return data!;
}

export async function deleteAsset(id: string): Promise<void> {
  await deleteRow('asset', id);
}

export async function isAssetNameAvailable(name: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('asset').select('id').ilike('name', name.trim());
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) === 0;
}
