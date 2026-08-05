import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { createIncident, deleteIncident, getIncident, listIncidents, updateIncident } from './api';
import type { IncidentStatus } from '@/lib/database.types';
import type { IncidentValues } from './schema';

export function useIncidents(status: 'all' | 'open' | IncidentStatus) {
  return useQuery({ queryKey: queryKeys.incidents.list(status), queryFn: () => listIncidents(status) });
}

export function useIncident(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidents.detail(id ?? ''),
    queryFn: () => getIncident(id!),
    enabled: !!id && id !== 'new',
  });
}

export function useSaveIncident(id: string | undefined, reportedBy: string | null) {
  const qc = useQueryClient();
  const isNew = !id || id === 'new';
  return useMutation({
    mutationFn: (values: IncidentValues) =>
      isNew ? createIncident(values, reportedBy) : updateIncident(id!, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.incidents.all }),
  });
}

export function useDeleteIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteIncident(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.incidents.all }),
  });
}
