import { supabase } from '@/lib/supabase';
import { deleteRow, rethrowSaveError } from '@/lib/crud';
import type { IncidentType } from '@/lib/database.types';

const COLUMNS = 'id, name, is_image_required, active, created_at, updated_at';

export async function listIncidentTypes(includeInactive: boolean): Promise<IncidentType[]> {
  let query = supabase.from('incident_type').select(COLUMNS).order('name');
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createIncidentType(name: string): Promise<IncidentType> {
  const { data, error } = await supabase
    .from('incident_type')
    .insert({ name: name.trim() })
    .select(COLUMNS)
    .single();
  if (error) rethrowSaveError(error);
  return data!;
}

export async function updateIncidentType(
  id: string,
  patch: { name?: string; active?: boolean },
): Promise<IncidentType> {
  const { data, error } = await supabase.from('incident_type').update(patch).eq('id', id).select(COLUMNS).single();
  if (error) rethrowSaveError(error);
  return data!;
}

export async function deleteIncidentType(id: string): Promise<void> {
  await deleteRow('incident_type', id);
}
