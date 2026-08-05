import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryClient';

/**
 * Active-only option lists for form pickers. Inactive records stay in history
 * but must not be offerable for new work — that is what `active` is for.
 */
function activeOptions(table: 'location' | 'asset_type' | 'incident_type') {
  return async () => {
    const { data, error } = await supabase.from(table).select('id, name').eq('active', true).order('name');
    if (error) throw error;
    return data ?? [];
  };
}

export function useLocationOptions() {
  return useQuery({ queryKey: ['lookups', 'location'], queryFn: activeOptions('location'), staleTime: 60_000 });
}

export function useAssetTypeOptions() {
  return useQuery({ queryKey: ['lookups', 'asset_type'], queryFn: activeOptions('asset_type'), staleTime: 60_000 });
}

export function useIncidentTypeOptions() {
  return useQuery({ queryKey: queryKeys.lookups.incidentTypes, queryFn: activeOptions('incident_type'), staleTime: 60_000 });
}

export function useGradings() {
  return useQuery({
    queryKey: queryKeys.lookups.gradings,
    queryFn: async () => {
      const { data, error } = await supabase.from('grading').select('id, name, priority').order('priority');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}
