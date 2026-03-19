import { z } from "zod";

import { channelCatalogEntrySchema, channelConfigSchema } from "./bff";

export const managedCatalogStatusValues = ["published", "hidden"] as const;

export const managedChannelCatalogEntrySchema = channelCatalogEntrySchema.extend({
  categories: z.array(z.string().min(1)),
  featured: z.boolean(),
  sort_order: z.number().int().nonnegative(),
  status: z.enum(managedCatalogStatusValues)
});

export type ManagedChannelCatalogEntry = z.infer<
  typeof managedChannelCatalogEntrySchema
>;

export const channelContentStateSchema = z.object({
  catalog: z.array(managedChannelCatalogEntrySchema),
  channel_config: channelConfigSchema,
  updated_at: z.string().min(1)
});

export type ChannelContentState = z.infer<typeof channelContentStateSchema>;

export const channelContentUpdateEntrySchema = z.object({
  categories: z.array(z.string().min(1)),
  description: z.string().min(1),
  featured: z.boolean(),
  game_id: z.string().min(1),
  sort_order: z.number().int().nonnegative(),
  status: z.enum(managedCatalogStatusValues)
});

export type ChannelContentUpdateEntry = z.infer<
  typeof channelContentUpdateEntrySchema
>;

export const channelContentUpdateRequestSchema = z.object({
  catalog: z.array(channelContentUpdateEntrySchema),
  channel_config: channelConfigSchema
});

export type ChannelContentUpdateRequest = z.infer<
  typeof channelContentUpdateRequestSchema
>;
