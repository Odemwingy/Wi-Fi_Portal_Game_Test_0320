import { parse } from "yaml";
import { z } from "zod";

import { gameCapabilityValues } from "./contracts";

export const gamePackageMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  frontend: z.object({
    route: z.string().startsWith("/"),
    assetsPath: z.string().min(1)
  }),
  server: z.object({
    image: z.string().min(1),
    port: z.number().int().positive()
  }),
  realtime: z.object({
    protocol: z.enum(["websocket", "sse"])
  }),
  dependencies: z.array(z.string()).default([]),
  capabilities: z.array(z.enum(gameCapabilityValues)).default([]),
  healthcheck: z.object({
    path: z.string().startsWith("/")
  }),
  observability: z.object({
    emitsStructuredLogs: z.boolean().default(true),
    supportsTraceContext: z.boolean().default(true)
  })
});

export type GamePackageMetadata = z.infer<typeof gamePackageMetadataSchema>;

export const parseGamePackageMetadata = (rawYaml: string) =>
  gamePackageMetadataSchema.parse(parse(rawYaml));
