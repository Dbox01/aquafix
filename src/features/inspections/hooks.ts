import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import {
  createInspection,
  deleteInspection,
  getAllocations,
  getDropdownOptions,
  getInspection,
  getRules,
  listInspections,
  saveDropdownOptions,
  saveRules,
  setAllocations,
  updateInspection,
} from './api';
import type { InspectionValues } from './schema';

export function useInspections(includeInactive: boolean) {
  return useQuery({
    queryKey: queryKeys.inspections.list(includeInactive),
    queryFn: () => listInspections(includeInactive),
  });
}

export function useInspection(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inspections.detail(id ?? ''),
    queryFn: () => getInspection(id!),
    enabled: !!id && id !== 'new',
  });
}

export function useAllocations(id: string | undefined) {
  return useQuery({
    queryKey: ['inspections', 'allocations', id ?? ''],
    queryFn: () => getAllocations(id!),
    enabled: !!id && id !== 'new',
  });
}

export function useDropdownOptions(id: string | undefined) {
  return useQuery({
    queryKey: ['inspections', 'options', id ?? ''],
    queryFn: () => getDropdownOptions(id!),
    enabled: !!id && id !== 'new',
  });
}

export function useRules(id: string | undefined) {
  return useQuery({
    queryKey: ['inspections', 'rules', id ?? ''],
    queryFn: () => getRules(id!),
    enabled: !!id && id !== 'new',
  });
}

export interface SaveInspectionInput {
  values: InspectionValues;
  assetTypeIds: string[];
  options: { id?: string; name: string; grading_id: string | null; boolean_match: boolean | null }[];
  rules: { lower_limit: number; upper_limit: number; grading_id: string | null }[];
}

/**
 * One save for the whole definition: the inspection, who it applies to, and how
 * its readings are graded.
 *
 * This is four statements, not a transaction — PostgREST has no client-side
 * transaction. If a later step fails the inspection exists with partial
 * configuration, which the edit screen shows plainly on reload. The alternative
 * is an RPC wrapping all four; worth doing if this ever proves flaky in
 * practice, but not worth the indirection before then.
 */
export function useSaveInspection(id: string | undefined) {
  const qc = useQueryClient();
  const isNew = !id || id === 'new';

  return useMutation({
    mutationFn: async (input: SaveInspectionInput) => {
      const row = isNew ? await createInspection(input.values) : await updateInspection(id!, input.values);
      await setAllocations(row.id, input.assetTypeIds);

      if (input.values.value_type === 'drop_down' || input.values.value_type === 'yes_no') {
        await saveDropdownOptions(row.id, input.options);
      }
      if (input.values.value_type === 'decimal_value' || input.values.value_type === 'cumulative_value') {
        await saveRules(row.id, input.rules);
      }
      return row;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: queryKeys.inspections.all });
      qc.invalidateQueries({ queryKey: ['inspections', 'allocations', row.id] });
      qc.invalidateQueries({ queryKey: ['inspections', 'options', row.id] });
      qc.invalidateQueries({ queryKey: ['inspections', 'rules', row.id] });
    },
  });
}

export function useDeleteInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteInspection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inspections.all }),
  });
}
