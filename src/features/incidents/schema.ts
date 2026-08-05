import { z } from 'zod';

/** Replaces Mendix Incident_Validate. */
export const incidentSchema = z.object({
  incident_type_id: z.string().min(1, 'Choose an incident type'),
  location_id: z.string().optional().or(z.literal('')),
  asset_id: z.string().optional().or(z.literal('')),
  status: z.enum(['new', 'in_progress', 'completed']),
  comment: z.string().trim().min(1, 'Describe what happened').max(2000, 'That is too long'),
});

export type IncidentValues = z.infer<typeof incidentSchema>;

export const incidentDefaults: IncidentValues = {
  incident_type_id: '',
  location_id: '',
  asset_id: '',
  status: 'new',
  comment: '',
};
