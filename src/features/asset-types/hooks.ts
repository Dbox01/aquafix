import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import {
  createAssetType,
  deleteAssetType,
  getAssetType,
  listAssetTypes,
  updateAssetType,
} from './api';
import type { AssetTypeValues } from './schema';

export function useAssetTypes(includeInactive: boolean) {
  return useQuery({
    queryKey: queryKeys.assetTypes.list(includeInactive),
    queryFn: () => listAssetTypes(includeInactive),
  });
}

export function useAssetType(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assetTypes.detail(id ?? ''),
    queryFn: () => getAssetType(id!),
    enabled: !!id && id !== 'new',
  });
}

/** Replaces Mendix ACT_AssetType_Save — handles both create and update. */
export function useSaveAssetType(id: string | undefined) {
  const qc = useQueryClient();
  const isNew = !id || id === 'new';

  return useMutation({
    mutationFn: (values: AssetTypeValues) =>
      isNew ? createAssetType(values) : updateAssetType(id!, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assetTypes.all }),
  });
}

export function useDeleteAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAssetType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assetTypes.all }),
  });
}
