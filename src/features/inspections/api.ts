import { supabase } from '@/lib/supabase';
import { deleteRow, rethrowSaveError } from '@/lib/crud';
import type { Inspection } from '@/lib/database.types';
import type { InspectionValues } from './schema';

const COLUMNS =
  'id, name, description, value_type, is_required, is_image_required, active, created_at, updated_at';

export async function listInspections(includeInactive: boolean): Promise<Inspection[]> {
  let query = supabase.from('inspection').select(COLUMNS).order('name');
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getInspection(id: string): Promise<Inspection> {
  const { data, error } = await supabase.from('inspection').select(COLUMNS).eq('id', id).single();
  if (error) throw error;
  return data;
}

function toRow(v: InspectionValues) {
  return {
    name: v.name,
    description: v.description || null,
    value_type: v.value_type,
    is_required: v.is_required,
    is_image_required: v.is_image_required,
    active: v.active,
  };
}

export async function createInspection(v: InspectionValues): Promise<Inspection> {
  const { data, error } = await supabase.from('inspection').insert(toRow(v)).select(COLUMNS).single();
  if (error) rethrowSaveError(error);
  return data!;
}

export async function updateInspection(id: string, v: InspectionValues): Promise<Inspection> {
  const { data, error } = await supabase.from('inspection').update(toRow(v)).eq('id', id).select(COLUMNS).single();
  if (error) rethrowSaveError(error);
  return data!;
}

export async function deleteInspection(id: string): Promise<void> {
  await deleteRow('inspection', id);
}

/* ---------------------------------------------------------------- allocation */

/**
 * Which asset types this inspection is allocated to.
 *
 * Mendix modelled this as Masterdata.InspectionAllocation with a
 * `FromAssetType` flag recording which side of the relationship created it.
 * The flag is kept for parity but the UI only ever writes from the inspection
 * side, so it is always true here.
 */
export async function getAllocations(inspectionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('inspection_allocation')
    .select('asset_type_id')
    .eq('inspection_id', inspectionId);
  if (error) throw error;
  return (data ?? []).map((r) => r.asset_type_id);
}

/**
 * Replace the allocation set in two statements rather than diffing client-side.
 * Deleting rows the user didn't touch and re-inserting them is fine here: the
 * table is a pure join with no history, and there are tens of rows, not
 * thousands.
 */
export async function setAllocations(inspectionId: string, assetTypeIds: string[]): Promise<void> {
  const { error: delErr } = await supabase
    .from('inspection_allocation')
    .delete()
    .eq('inspection_id', inspectionId);
  if (delErr) throw delErr;

  if (assetTypeIds.length === 0) return;

  const { error } = await supabase.from('inspection_allocation').insert(
    assetTypeIds.map((assetTypeId, idx) => ({
      inspection_id: inspectionId,
      asset_type_id: assetTypeId,
      from_asset_type: true,
      priority: idx,
    })),
  );
  if (error) throw error;
}

/* ----------------------------------------------------------- grading config */

export interface DropdownOptionRow {
  id: string;
  name: string;
  priority: number;
  active: boolean;
  grading_id: string | null;
  boolean_match: boolean | null;
}

export async function getDropdownOptions(inspectionId: string): Promise<DropdownOptionRow[]> {
  const { data, error } = await supabase
    .from('inspection_dropdown_option')
    .select('id, name, priority, active, grading_id, boolean_match')
    .eq('inspection_id', inspectionId)
    .order('priority');
  if (error) throw error;
  return data ?? [];
}

/**
 * Options double as the grading table for yes/no inspections: a yes_no
 * inspection stores two rows whose `boolean_match` is true and false, and
 * resolve_grading() looks up the grade by matching the recorded boolean. That
 * is why this one function serves both value types.
 */
export async function saveDropdownOptions(
  inspectionId: string,
  rows: { id?: string; name: string; grading_id: string | null; boolean_match: boolean | null }[],
): Promise<void> {
  const { data: existing, error: readErr } = await supabase
    .from('inspection_dropdown_option')
    .select('id')
    .eq('inspection_id', inspectionId);
  if (readErr) throw readErr;

  const keep = new Set(rows.map((r) => r.id).filter(Boolean) as string[]);
  const remove = (existing ?? []).map((r) => r.id).filter((id) => !keep.has(id));

  if (remove.length > 0) {
    const { data, error } = await supabase
      .from('inspection_dropdown_option')
      .delete()
      .in('id', remove)
      .select('id');
    if (error) throw error;
    // A silent zero here means RLS refused, or the option is referenced by a
    // recorded reading. Either way the user must not be told it worked.
    if ((data?.length ?? 0) !== remove.length) {
      throw new Error('Some options could not be removed — they may already have readings recorded against them.');
    }
  }

  for (const [idx, r] of rows.entries()) {
    if (r.id) {
      const { error } = await supabase
        .from('inspection_dropdown_option')
        .update({ name: r.name, grading_id: r.grading_id, boolean_match: r.boolean_match, priority: idx, active: true })
        .eq('id', r.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('inspection_dropdown_option').insert({
        inspection_id: inspectionId,
        name: r.name,
        grading_id: r.grading_id,
        boolean_match: r.boolean_match,
        priority: idx,
        active: true,
      });
      if (error) throw error;
    }
  }
}

export interface RuleRow {
  id: string;
  lower_limit: number;
  upper_limit: number;
  grading_id: string | null;
}

export async function getRules(inspectionId: string): Promise<RuleRow[]> {
  const { data, error } = await supabase
    .from('inspection_rule')
    .select('id, lower_limit, upper_limit, grading_id')
    .eq('inspection_id', inspectionId)
    .order('lower_limit');
  if (error) throw error;
  return data ?? [];
}

/**
 * Bands are replaced wholesale, not patched.
 *
 * The GiST exclusion constraint rejects any overlap, which means an in-place
 * edit that moves one band past another fails even when the final state is
 * valid. Delete-then-insert inside one request avoids ordering games; if the
 * insert fails the whole thing is rejected and the caller refetches.
 */
export async function saveRules(
  inspectionId: string,
  rows: { lower_limit: number; upper_limit: number; grading_id: string | null }[],
): Promise<void> {
  const { data: existing, error: readErr } = await supabase
    .from('inspection_rule')
    .select('id')
    .eq('inspection_id', inspectionId);
  if (readErr) throw readErr;

  const { data: deleted, error: delErr } = await supabase
    .from('inspection_rule')
    .delete()
    .eq('inspection_id', inspectionId)
    .select('id');
  if (delErr) throw delErr;
  // RLS refuses deletes silently. Without this check the insert below would
  // collide with the rows we think we removed and surface as "bands overlap",
  // which would send someone hunting for a bug in their band configuration.
  if ((deleted?.length ?? 0) !== (existing?.length ?? 0)) {
    throw new Error('You do not have permission to change the grading bands for this inspection.');
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('inspection_rule')
    .insert(rows.map((r) => ({ ...r, inspection_id: inspectionId })));
  if (error) {
    if (typeof error === 'object' && error && 'code' in error && (error as { code: string }).code === '23P01') {
      throw new Error('Two bands overlap. Each value must fall into exactly one band.');
    }
    throw error;
  }
}

export async function isInspectionNameAvailable(name: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('inspection').select('id').ilike('name', name.trim());
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) === 0;
}
