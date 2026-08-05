import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import {
  createLocation,
  deleteLocation,
  getLocation,
  listLocations,
  updateLocation,
} from './api';
import type { LocationValues } from './schema';

export function useLocations(includeInactive: boolean) {
  return useQuery({
    queryKey: queryKeys.locations.list(includeInactive),
    queryFn: () => listLocations(includeInactive),
  });
}

export function useLocation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.locations.detail(id ?? ''),
    queryFn: () => getLocation(id!),
    enabled: !!id && id !== 'new',
  });
}

/** Replaces Mendix ACT_Location_Save — handles both create and update. */
export function useSaveLocation(id: string | undefined) {
  const qc = useQueryClient();
  const isNew = !id || id === 'new';

  return useMutation({
    mutationFn: (values: LocationValues) =>
      isNew ? createLocation(values) : updateLocation(id!, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.locations.all }),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLocation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.locations.all }),
  });
}
