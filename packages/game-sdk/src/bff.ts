import { z } from "zod";

import { gameCapabilityValues, launchContextSchema } from "./contracts";

export const channelConfigSchema = z.object({
  airline_code: z.string().min(2),
  channel_name: z.string().min(1),
  locale: z.string().min(2),
  hero_title: z.string().min(1),
  sections: z.array(z.string().min(1)),
  feature_flags: z.record(z.boolean())
});

export type ChannelConfig = z.infer<typeof channelConfigSchema>;

export const channelCatalogEntrySchema = z.object({
  game_id: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string().min(1),
  route: z.string().startsWith("/"),
  categories: z.array(z.string().min(1)),
  capabilities: z.array(z.enum(gameCapabilityValues)),
  points_enabled: z.boolean()
});

export type ChannelCatalogEntry = z.infer<typeof channelCatalogEntrySchema>;

export const sessionBootstrapRequestSchema = z.object({
  airline_code: z.string().min(2),
  cabin_class: z.string().min(1).default("economy"),
  locale: z.string().min(2).default("en-US"),
  passenger_id: z.string().min(1).optional(),
  session_id: z.string().min(1).optional(),
  seat_number: z.string().min(1).optional()
});

export type SessionBootstrapRequest = z.infer<
  typeof sessionBootstrapRequestSchema
>;

export const sessionBootstrapResponseSchema = z.object({
  trace_id: z.string().min(1),
  session: launchContextSchema.extend({
    sessionId: z.string().min(1)
  }),
  channel_config: channelConfigSchema,
  catalog: z.array(channelCatalogEntrySchema)
});

export type SessionBootstrapResponse = z.infer<
  typeof sessionBootstrapResponseSchema
>;
