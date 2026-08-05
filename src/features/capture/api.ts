import { supabase } from '@/lib/supabase';
import type { InspectionValueType } from '@/lib/database.types';

/** One inspection to perform, with everything the input needs to render. */
export interface InspectionToPerform {
  id: string;
  name: string;
  description: string | null;
  value_type: InspectionValueType;
  is_required: boolean;
  priority: number;
  options: { id: string; name: string }[];
}

export interface AssetForCapture {
  id: string;
  name: string;
  code: string | null;
  asset_type_id: string | null;
  asset_type_name: string | null;
  location_name: string | null;
}

export async function getAssetForCapture(assetId: string): Promise<AssetForCapture> {
  const { data, error } = await supabase
    .from('asset_overview')
    .select('id, name, code, asset_type_id, asset_type_name, location_name')
    .eq('id', assetId)
    .single();
  if (error) throw error;
  return data as AssetForCapture;
}

/**
 * The checklist for an asset: every active inspection allocated to its asset
 * type, in allocation order.
 *
 * Mendix resolved this through Masterdata.InspectionAllocation, which joins
 * AssetType to Inspection. An asset with no allocated inspections has nothing
 * to record — the UI says so rather than showing an empty form.
 */
export async function getInspectionsForAsset(assetTypeId: string): Promise<InspectionToPerform[]> {
  const { data, error } = await supabase
    .from('inspection_allocation')
    .select('priority, inspection:inspection_id (id, name, description, value_type, is_required, active)')
    .eq('asset_type_id', assetTypeId)
    .order('priority');
  if (error) throw error;

  type Row = { priority: number; inspection: InspectionToPerform | null };
  const rows = ((data ?? []) as unknown as Row[])
    .filter((r) => r.inspection && (r.inspection as unknown as { active: boolean }).active)
    .map(
      (r): InspectionToPerform => ({
        ...(r.inspection as InspectionToPerform),
        priority: r.priority,
        options: [],
      }),
    );

  // Fetch dropdown options in one round trip rather than N.
  const dropdownIds = rows.filter((r) => r.value_type === 'drop_down').map((r) => r.id);
  if (dropdownIds.length > 0) {
    const { data: opts, error: optErr } = await supabase
      .from('inspection_dropdown_option')
      .select('id, name, inspection_id, priority')
      .in('inspection_id', dropdownIds)
      .eq('active', true)
      .order('priority');
    if (optErr) throw optErr;
    for (const row of rows) {
      row.options = (opts ?? [])
        .filter((o) => o.inspection_id === row.id)
        .map((o) => ({ id: o.id, name: o.name }));
    }
  }

  return rows;
}

/** One recorded reading, in whichever shape the inspection's value_type needs. */
export interface CaptureReading {
  inspection_id: string;
  value_type: InspectionValueType;
  text_value?: string | null;
  decimal_value?: number | null;
  boolean_value?: boolean | null;
  date_value?: string | null;
  dropdown_option_id?: string | null;
}

export interface SavedActivity {
  id: string;
  grading_name: string | null;
  grading_priority: number | null;
  values: { inspection_name: string; display: string; grading_name: string | null; grading_priority: number | null }[];
}

/**
 * Save a completed inspection.
 *
 * Gradings are NOT sent from here. A database trigger calls resolve_grading()
 * on write and rolls the worst result up to the activity (ADR-006). That means
 * the UI, an import, and a manual SQL fix all get the same answer, and the
 * mobile flow saves a round trip on a bad connection.
 */
export async function saveInspection(
  assetId: string,
  performedBy: string | null,
  readings: CaptureReading[],
  notes: string,
): Promise<SavedActivity> {
  const { data: activity, error: actErr } = await supabase
    .from('inspection_activity')
    .insert({ asset_id: assetId, performed_by: performedBy, notes: notes || null })
    .select('id')
    .single();
  if (actErr) throw actErr;

  const rows = readings.map((r) => ({
    inspection_activity_id: activity.id,
    inspection_id: r.inspection_id,
    text_value: r.text_value ?? null,
    decimal_value: r.decimal_value ?? null,
    boolean_value: r.boolean_value ?? null,
    date_value: r.date_value ?? null,
    dropdown_option_id: r.dropdown_option_id ?? null,
  }));

  if (rows.length > 0) {
    const { error: valErr } = await supabase.from('inspection_value').insert(rows);
    if (valErr) {
      // Don't leave a headless activity behind if the readings failed.
      await supabase.from('inspection_activity').delete().eq('id', activity.id);
      throw valErr;
    }
  }

  return getActivityResult(activity.id);
}

/** Read back what the database decided, rather than guessing client-side. */
export async function getActivityResult(activityId: string): Promise<SavedActivity> {
  const { data, error } = await supabase
    .from('inspection_activity')
    .select(
      'id, notes, inspection_date, grading:grading_id (name, priority), values:inspection_value (text_value, decimal_value, boolean_value, date_value, grading:grading_id (name, priority), inspection:inspection_id (name, value_type), option:dropdown_option_id (name))',
    )
    .eq('id', activityId)
    .single();
  if (error) throw error;

  type Nested = {
    id: string;
    grading: { name: string; priority: number } | null;
    values: {
      text_value: string | null;
      decimal_value: number | null;
      boolean_value: boolean | null;
      date_value: string | null;
      grading: { name: string; priority: number } | null;
      inspection: { name: string; value_type: InspectionValueType } | null;
      option: { name: string } | null;
    }[];
  };
  const row = data as unknown as Nested;

  return {
    id: row.id,
    grading_name: row.grading?.name ?? null,
    grading_priority: row.grading?.priority ?? null,
    values: (row.values ?? []).map((v) => ({
      inspection_name: v.inspection?.name ?? 'Unknown',
      display: displayValue(v),
      grading_name: v.grading?.name ?? null,
      grading_priority: v.grading?.priority ?? null,
    })),
  };
}

/**
 * Replaces Mendix InspectionValue._DisplayValue, which a microflow maintained
 * on every write. Formatting is a presentation concern — it does not belong in
 * a stored column that can drift out of sync with the value it describes.
 */
export function displayValue(v: {
  text_value: string | null;
  decimal_value: number | null;
  boolean_value: boolean | null;
  date_value: string | null;
  option?: { name: string } | null;
}): string {
  if (v.option?.name) return v.option.name;
  if (v.boolean_value !== null && v.boolean_value !== undefined) return v.boolean_value ? 'Yes' : 'No';
  if (v.decimal_value !== null && v.decimal_value !== undefined) return String(Math.round(v.decimal_value * 100) / 100);
  if (v.date_value) return new Date(v.date_value).toLocaleDateString();
  if (v.text_value) return v.text_value;
  return '—';
}

export async function listRecentActivities(limit = 50) {
  const { data, error } = await supabase
    .from('inspection_activity')
    .select('id, inspection_date, notes, asset:asset_id (name, code), grading:grading_id (name, priority), performer:performed_by (full_name, email)')
    .order('inspection_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listActivitiesForAsset(assetId: string) {
  const { data, error } = await supabase
    .from('inspection_activity')
    .select('id, inspection_date, notes, grading:grading_id (name, priority), performer:performed_by (full_name, email)')
    .eq('asset_id', assetId)
    .order('inspection_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
