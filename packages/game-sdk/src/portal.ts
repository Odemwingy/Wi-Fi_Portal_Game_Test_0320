import { z } from "zod";

import { launchContextSchema } from "./contracts";

export const portalLaunchContextSchema = launchContextSchema.extend({
  gameId: z.string().min(1),
  roomId: z.string().min(1).nullable(),
  traceId: z.string().min(1)
});

export type PortalLaunchContext = z.infer<typeof portalLaunchContextSchema>;

export const portalPackageReadyMessageSchema = z.object({
  channel: z.literal("wifi-portal-portal"),
  payload: z.object({
    game_id: z.string().min(1)
  }),
  type: z.literal("portal.package.ready")
});

export type PortalPackageReadyMessage = z.infer<
  typeof portalPackageReadyMessageSchema
>;

export const portalPackageResizeMessageSchema = z.object({
  channel: z.literal("wifi-portal-portal"),
  payload: z.object({
    game_id: z.string().min(1),
    height: z.number().int().positive()
  }),
  type: z.literal("portal.package.resize")
});

export type PortalPackageResizeMessage = z.infer<
  typeof portalPackageResizeMessageSchema
>;

export const portalHostLaunchContextMessageSchema = z.object({
  channel: z.literal("wifi-portal-portal"),
  payload: z.object({
    launch_context: portalLaunchContextSchema
  }),
  type: z.literal("portal.host.launch-context")
});

export type PortalHostLaunchContextMessage = z.infer<
  typeof portalHostLaunchContextMessageSchema
>;

export const portalMessageSchema = z.discriminatedUnion("type", [
  portalPackageReadyMessageSchema,
  portalPackageResizeMessageSchema,
  portalHostLaunchContextMessageSchema
]);

export type PortalMessage = z.infer<typeof portalMessageSchema>;
