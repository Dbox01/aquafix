import { z } from 'zod';

/** Replaces Mendix Inspection_Validate. */
export const inspectionSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  description: z.string().trim().max(500, 'Description is too long').optional().or(z.literal('')),
  value_type: z.enum(['decimal_value', 'cumulative_value', 'yes_no', 'drop_down', 'text', 'datetime'], {
    errorMap: () => ({ message: 'Choose what kind of reading this is' }),
  }),
  is_required: z.boolean(),
  is_image_required: z.boolean(),
  active: z.boolean(),
});

export type InspectionValues = z.infer<typeof inspectionSchema>;

export const inspectionDefaults: InspectionValues = {
  name: '',
  description: '',
  value_type: 'yes_no',
  is_required: true,
  is_image_required: false,
  active: true,
};

/**
 * A numeric band. Bands are half-open [lower, upper) and the database enforces
 * non-overlap with a GiST exclusion constraint — this schema only catches the
 * obvious mistake early so the user sees it beside the field rather than as a
 * Postgres error.
 */
export const ruleSchema = z
  .object({
    lower_limit: z.number({ invalid_type_error: 'Enter a number' }),
    upper_limit: z.number({ invalid_type_error: 'Enter a number' }),
    grading_id: z.string().min(1, 'Choose a grade'),
  })
  .refine((v) => v.upper_limit > v.lower_limit, {
    message: 'Upper limit must be greater than lower limit',
    path: ['upper_limit'],
  });

export type RuleValues = z.infer<typeof ruleSchema>;
