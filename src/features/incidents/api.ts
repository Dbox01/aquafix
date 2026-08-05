import { supabase } from '@/lib/supabase';
import { deleteRow, rethrowSaveError } from '@/lib/crud';
import type { Incident, IncidentStatus } from '@/lib/database.types';
import type { IncidentValues } from './schema';

const LIST_COLUMNS =
  'id, status, incident_date, completed_date, comment, incident_type:incident_type_id (name), location:location_id (name), asset:asset_id (name), reporter:reported_by (full_name, email)';

export interface IncidentListRow {
  id: string;
  status: IncidentStatus;
  incident_date: string;
  completed_date: string | null;
  comment: string | null;
  incident_type: { name: string } | null;
  location: { name: string } | null;
  asset: { name: string } | null;
  reporter: { full_name: string | null; email: string } | null;
}

export async function listIncidents(status: 'all' | 'open' | IncidentStatus): Promise<IncidentListRow[]> {
  let query = supabase.from('incident').select(LIST_COLUMNS).order('incident_date', { ascending: false });
  // "Open" is the default view: an incident list that shows everything ever
  // closed is a list nobody reads.
  if (status === 'open') query = query.in('status', ['new', 'in_progress']);
  else if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as IncidentListRow[];
}

export async function getIncident(id: string): Promise<Incident> {
  const { data, error } = await supabase
    .from('incident')
    .select('id, incident_type_id, location_id, asset_id, reported_by, status, incident_date, completed_date, comment, created_at, updated_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * `completed_date` is derived from status rather than being a separate field on
 * the form. In Mendix a microflow set it, and it could be left stale when an
 * incident was reopened — here reopening clears it in the same statement that
 * changes the status.
 */
function toRow(v: IncidentValues) {
  return {
    incident_type_id: v.incident_type_id,
    location_id: v.location_id || null,
    asset_id: v.asset_id || null,
    status: v.status,
    comment: v.comment,
    completed_date: v.status === 'completed' ? new Date().toISOString() : null,
  };
}

export async function createIncident(v: IncidentValues, reportedBy: string | null): Promise<Incident> {
  const { data, error } = await supabase
    .from('incident')
    .insert({ ...toRow(v), reported_by: reportedBy })
    .select('id, incident_type_id, location_id, asset_id, reported_by, status, incident_date, completed_date, comment, created_at, updated_at')
    .single();
  if (error) rethrowSaveError(error);
  return data!;
}

export async function updateIncident(id: string, v: IncidentValues): Promise<Incident> {
  const { data, error } = await supabase
    .from('incident')
    .update(toRow(v))
    .eq('id', id)
    .select('id, incident_type_id, location_id, asset_id, reported_by, status, incident_date, completed_date, comment, created_at, updated_at')
    .single();
  if (error) rethrowSaveError(error);
  return data!;
}

export async function deleteIncident(id: string): Promise<void> {
  await deleteRow('incident', id);
}
