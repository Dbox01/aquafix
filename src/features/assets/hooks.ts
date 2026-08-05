import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { createAsset, deleteAsset, getAsset, listAssets, updateAsset } from './api';
import type { AssetValues } from './schema';

export function useAssets(includeInactive: boolean) {
  return useQuery({ queryKey: queryKeys.assets.list(includeInactive), queryFn: () => listAssets(includeInactive) });
}

export function useAsset(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assets.detail(id ?? ''),
    queryFn: () => getAsset(id!),
    enabled: !!id && id !== 'new',
  });
}

export function useSaveAsset(id: string | undefined) {
  const qc = useQueryClient();
  const isNew = !id || id === 'new';
  return useMutation({
    mutationFn: (values: AssetValues) => (isNew ? createAsset(values) : updateAsset(id!, values)),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all }),
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all }),
  });
}
