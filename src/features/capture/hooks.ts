import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import {
  getActivityResult,
  getAssetForCapture,
  getInspectionsForAsset,
  listActivitiesForAsset,
  listRecentActivities,
  saveInspection,
  type CaptureReading,
} from './api';

export function useAssetForCapture(assetId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assets.detail(assetId ?? ''),
    queryFn: () => getAssetForCapture(assetId!),
    enabled: !!assetId,
  });
}

/**
 * The checklist. Keyed by asset type, not asset — two pumps of the same type
 * share a checklist, so the second one opens instantly from cache.
 */
export function useInspectionsForAssetType(assetTypeId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.inspections.forAsset(assetTypeId ?? ''),
    queryFn: () => getInspectionsForAsset(assetTypeId!),
    enabled: !!assetTypeId,
    staleTime: 60_000,
  });
}

export function useSaveInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { assetId: string; performedBy: string | null; readings: CaptureReading[]; notes: string }) =>
      saveInspection(v.assetId, v.performedBy, v.readings, v.notes),
    onSuccess: (_result, v) => {
      // The asset's last_inspection_date and inspection_count both moved.
      qc.invalidateQueries({ queryKey: queryKeys.activities.all });
      qc.invalidateQueries({ queryKey: queryKeys.assets.all });
      qc.invalidateQueries({ queryKey: queryKeys.assets.detail(v.assetId) });
    },
  });
}

export function useActivityResult(activityId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.activities.detail(activityId ?? ''),
    queryFn: () => getActivityResult(activityId!),
    enabled: !!activityId,
  });
}

export function useRecentActivities(limit = 50) {
  return useQuery({ queryKey: queryKeys.activities.list(), queryFn: () => listRecentActivities(limit) });
}

export function useActivitiesForAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.activities.forAsset(assetId ?? ''),
    queryFn: () => listActivitiesForAsset(assetId!),
    enabled: !!assetId,
  });
}
