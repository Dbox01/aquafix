/**
 * Database types for AquaFix.
 *
 * Derived from `supabase gen types` against the live project. Regenerate after
 * every migration rather than editing by hand — a type that disagrees with the
 * schema is worse than no type at all.
 *
 * Relationship metadata is trimmed to `[]`: we use explicit joins in `api.ts`
 * rather than PostgREST's implicit-embed inference, so the full FK graph would
 * be noise.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'user' | 'admin' | 'system_admin';

export type InspectionValueType =
  | 'cumulative_value'
  | 'datetime'
  | 'drop_down'
  | 'yes_no'
  | 'decimal_value'
  | 'text';

export type IncidentStatus = 'new' | 'in_progress' | 'completed';

/** Value types that accept a free-form reading rather than a picked option. */
export const VALUE_TYPE_LABELS: Record<InspectionValueType, string> = {
  decimal_value: 'Number',
  cumulative_value: 'Meter reading',
  yes_no: 'Yes / No',
  drop_down: 'Choose an option',
  text: 'Text',
  datetime: 'Date',
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  completed: 'Completed',
};

interface T<Row, Insert, Update> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      profile: T<
        { id: string; email: string; full_name: string | null; role: UserRole; active: boolean; created_at: string; updated_at: string },
        { id: string; email: string; full_name?: string | null; role?: UserRole; active?: boolean },
        { full_name?: string | null; role?: UserRole; active?: boolean }
      >;
      location: T<
        { id: string; name: string; active: boolean; created_at: string; updated_at: string },
        { id?: string; name: string; active?: boolean },
        { name?: string; active?: boolean }
      >;
      asset_type: T<
        { id: string; name: string; active: boolean; created_at: string; updated_at: string },
        { id?: string; name: string; active?: boolean },
        { name?: string; active?: boolean }
      >;
      asset: T<
        { id: string; name: string; code: string | null; asset_type_id: string | null; location_id: string | null; purchase_date: string | null; active: boolean; created_at: string; updated_at: string },
        { id?: string; name: string; code?: string | null; asset_type_id?: string | null; location_id?: string | null; purchase_date?: string | null; active?: boolean },
        { name?: string; code?: string | null; asset_type_id?: string | null; location_id?: string | null; purchase_date?: string | null; active?: boolean }
      >;
      inspection: T<
        { id: string; name: string; description: string | null; value_type: InspectionValueType; is_required: boolean; is_image_required: boolean; active: boolean; created_at: string; updated_at: string },
        { id?: string; name: string; description?: string | null; value_type: InspectionValueType; is_required?: boolean; is_image_required?: boolean; active?: boolean },
        { name?: string; description?: string | null; value_type?: InspectionValueType; is_required?: boolean; is_image_required?: boolean; active?: boolean }
      >;
      inspection_allocation: T<
        { id: string; asset_type_id: string; inspection_id: string; from_asset_type: boolean; priority: number; created_at: string; updated_at: string },
        { id?: string; asset_type_id: string; inspection_id: string; from_asset_type?: boolean; priority?: number },
        { asset_type_id?: string; inspection_id?: string; priority?: number }
      >;
      colour_container: T<
        { id: string; name: string; hex_colour: string; class_name: string | null; created_at: string; updated_at: string },
        { id?: string; name: string; hex_colour: string; class_name?: string | null },
        { name?: string; hex_colour?: string; class_name?: string | null }
      >;
      grading: T<
        { id: string; name: string; priority: number; class_name: string | null; colour_container_id: string | null; created_at: string; updated_at: string },
        { id?: string; name: string; priority?: number; class_name?: string | null; colour_container_id?: string | null },
        { name?: string; priority?: number; class_name?: string | null; colour_container_id?: string | null }
      >;
      inspection_dropdown_option: T<
        { id: string; inspection_id: string; grading_id: string | null; name: string; priority: number; active: boolean; boolean_match: boolean | null; created_at: string; updated_at: string },
        { id?: string; inspection_id: string; grading_id?: string | null; name: string; priority?: number; active?: boolean; boolean_match?: boolean | null },
        { grading_id?: string | null; name?: string; priority?: number; active?: boolean; boolean_match?: boolean | null }
      >;
      inspection_rule: T<
        { id: string; inspection_id: string; grading_id: string | null; lower_limit: number; upper_limit: number; created_at: string; updated_at: string },
        { id?: string; inspection_id: string; grading_id?: string | null; lower_limit: number; upper_limit: number },
        { grading_id?: string | null; lower_limit?: number; upper_limit?: number }
      >;
      inspection_activity: T<
        { id: string; asset_id: string; grading_id: string | null; performed_by: string | null; inspection_date: string; notes: string | null; created_at: string; updated_at: string },
        { id?: string; asset_id: string; grading_id?: string | null; performed_by?: string | null; inspection_date?: string; notes?: string | null },
        { grading_id?: string | null; notes?: string | null; inspection_date?: string }
      >;
      inspection_value: T<
        { id: string; inspection_activity_id: string; inspection_id: string; grading_id: string | null; dropdown_option_id: string | null; text_value: string | null; decimal_value: number | null; boolean_value: boolean | null; date_value: string | null; created_at: string; updated_at: string },
        { id?: string; inspection_activity_id: string; inspection_id: string; dropdown_option_id?: string | null; text_value?: string | null; decimal_value?: number | null; boolean_value?: boolean | null; date_value?: string | null },
        { dropdown_option_id?: string | null; text_value?: string | null; decimal_value?: number | null; boolean_value?: boolean | null; date_value?: string | null }
      >;
      incident_type: T<
        { id: string; name: string; is_image_required: boolean; active: boolean; created_at: string; updated_at: string },
        { id?: string; name: string; is_image_required?: boolean; active?: boolean },
        { name?: string; is_image_required?: boolean; active?: boolean }
      >;
      incident: T<
        { id: string; incident_type_id: string | null; location_id: string | null; asset_id: string | null; reported_by: string | null; status: IncidentStatus; incident_date: string; completed_date: string | null; comment: string | null; created_at: string; updated_at: string },
        { id?: string; incident_type_id?: string | null; location_id?: string | null; asset_id?: string | null; reported_by?: string | null; status?: IncidentStatus; incident_date?: string; completed_date?: string | null; comment?: string | null },
        { incident_type_id?: string | null; location_id?: string | null; asset_id?: string | null; status?: IncidentStatus; completed_date?: string | null; comment?: string | null }
      >;
    };
    Views: {
      asset_overview: {
        Row: {
          id: string | null;
          name: string | null;
          code: string | null;
          active: boolean | null;
          asset_type_id: string | null;
          asset_type_name: string | null;
          location_id: string | null;
          location_name: string | null;
          purchase_date: string | null;
          last_inspection_date: string | null;
          inspection_count: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: UserRole };
      resolve_grading: {
        Args: {
          p_inspection_id: string;
          p_value_type: InspectionValueType;
          p_decimal_value: number | null;
          p_dropdown_option_id: string | null;
          p_boolean_value?: boolean | null;
        };
        Returns: string | null;
      };
    };
    Enums: {
      user_role: UserRole;
      inspection_value_type: InspectionValueType;
      incident_status: IncidentStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

type Tbl = Database['public']['Tables'];

export type Profile = Tbl['profile']['Row'];
export type Location = Tbl['location']['Row'];
export type AssetType = Tbl['asset_type']['Row'];
export type Asset = Tbl['asset']['Row'];
export type Inspection = Tbl['inspection']['Row'];
export type Grading = Tbl['grading']['Row'];
export type InspectionDropdownOption = Tbl['inspection_dropdown_option']['Row'];
export type InspectionRule = Tbl['inspection_rule']['Row'];
export type InspectionActivity = Tbl['inspection_activity']['Row'];
export type InspectionValue = Tbl['inspection_value']['Row'];
export type IncidentType = Tbl['incident_type']['Row'];
export type Incident = Tbl['incident']['Row'];
export type AssetOverview = Database['public']['Views']['asset_overview']['Row'];
