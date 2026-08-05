import { z } from 'zod';

/**
 * Replaces Mendix Masterdata.Location_Validate.
 *
 * This is the UX half. The correctness half is the CHECK constraint and unique
 * index in migration 0002 — both, not either. (CLAUDE.md, Database rules)
 */
export const locationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(200, 'Name must be 200 characters or fewer'),
  active: z.boolean(),
});

export type LocationValues = z.infer<typeof locationSchema>;

export const locationDefaults: LocationValues = { name: '', active: true };
