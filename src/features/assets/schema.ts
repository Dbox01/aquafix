import { z } from 'zod';

export const assetSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'Name must be 200 characters or fewer'),
  code: z.string().trim().max(50).optional().or(z.literal('')),
  asset_type_id: z.string().uuid('Select an asset type'),
  location_id: z.string().uuid('Select a location'),
  purchase_date: z.string().optional().or(z.literal('')),
  active: z.boolean(),
});

export type AssetValues = z.infer<typeof assetSchema>;

export const assetDefaults: AssetValues = {
  name: '', code: '', asset_type_id: '', location_id: '', purchase_date: '', active: true,
};
