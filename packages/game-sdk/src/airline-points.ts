import { z } from "zod";

export const airlinePointsSyncModeSchema = z.enum(["realtime", "batch"]);
export const airlinePointsAdapterProviderSchema = z.enum([
  "mock-http",
  "legacy-batch"
]);
export const airlinePointsSimulationModeSchema = z.enum([
  "success",
  "retryable_failure",
  "permanent_failure"
]);
export const airlinePointsSyncStatusSchema = z.enum([
  "pending",
  "synced",
  "failed"
]);

export const airlinePointsRetryPolicySchema = z.object({
  base_backoff_seconds: z.number().int().positive().max(3600),
  max_attempts: z.number().int().positive().max(10)
});

export const airlinePointsConfigSchema = z.object({
  airline_code: z.string().min(2).max(8),
  api_base_url: z.string().url(),
  auth_credential: z.string().min(1),
  auth_type: z.enum(["none", "bearer", "api_key"]),
  enabled: z.boolean(),
  field_mapping: z.record(z.string().min(1)),
  points_multiplier: z.number().positive().max(100),
  provider: airlinePointsAdapterProviderSchema,
  retry_policy: airlinePointsRetryPolicySchema,
  simulation_mode: airlinePointsSimulationModeSchema,
  sync_mode: airlinePointsSyncModeSchema,
  updated_at: z.string().min(1)
});

export const airlinePointsConfigUpsertRequestSchema = z.object({
  airline_code: z.string().min(2).max(8),
  api_base_url: z.string().url(),
  auth_credential: z.string().min(1),
  auth_type: z.enum(["none", "bearer", "api_key"]),
  enabled: z.boolean(),
  field_mapping: z.record(z.string().min(1)),
  points_multiplier: z.number().positive().max(100),
  provider: airlinePointsAdapterProviderSchema,
  retry_policy: airlinePointsRetryPolicySchema,
  simulation_mode: airlinePointsSimulationModeSchema,
  sync_mode: airlinePointsSyncModeSchema
});

export const airlinePointsSyncRecordSchema = z.object({
  airline_code: z.string().min(2).max(8),
  attempt_count: z.number().int().nonnegative(),
  converted_points: z.number().int().nonnegative(),
  created_at: z.string().min(1),
  external_reference: z.string().min(1).nullable(),
  game_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  last_attempt_at: z.string().min(1).nullable(),
  last_error: z.string().min(1).nullable(),
  max_attempts: z.number().int().positive(),
  passenger_id: z.string().min(1),
  payload_preview: z.record(z.unknown()),
  points: z.number().int().nonnegative(),
  provider: airlinePointsAdapterProviderSchema,
  report_id: z.string().min(1),
  room_id: z.string().min(1).nullable(),
  session_id: z.string().min(1),
  status: airlinePointsSyncStatusSchema,
  sync_id: z.string().min(1),
  sync_mode: airlinePointsSyncModeSchema,
  synced_at: z.string().min(1).nullable(),
  next_retry_at: z.string().min(1).nullable(),
  updated_at: z.string().min(1)
});

export const pointsAirlineSyncSummarySchema = airlinePointsSyncRecordSchema.pick({
  airline_code: true,
  attempt_count: true,
  external_reference: true,
  idempotency_key: true,
  last_error: true,
  next_retry_at: true,
  status: true,
  sync_id: true,
  sync_mode: true,
  synced_at: true,
  updated_at: true
});

export const airlinePointsSyncListResponseSchema = z.object({
  entries: z.array(airlinePointsSyncRecordSchema),
  trace_id: z.string().min(1)
});

export const airlinePointsDispatchPendingRequestSchema = z.object({
  airline_code: z.string().min(2).max(8).optional(),
  limit: z.number().int().positive().max(50).optional()
});

export const airlinePointsDispatchPendingResponseSchema = z.object({
  entries: z.array(airlinePointsSyncRecordSchema),
  processed_count: z.number().int().nonnegative(),
  trace_id: z.string().min(1)
});

export type AirlinePointsAdapterProvider = z.infer<
  typeof airlinePointsAdapterProviderSchema
>;
export type AirlinePointsConfig = z.infer<typeof airlinePointsConfigSchema>;
export type AirlinePointsConfigUpsertRequest = z.infer<
  typeof airlinePointsConfigUpsertRequestSchema
>;
export type AirlinePointsDispatchPendingRequest = z.infer<
  typeof airlinePointsDispatchPendingRequestSchema
>;
export type AirlinePointsDispatchPendingResponse = z.infer<
  typeof airlinePointsDispatchPendingResponseSchema
>;
export type AirlinePointsRetryPolicy = z.infer<
  typeof airlinePointsRetryPolicySchema
>;
export type AirlinePointsSimulationMode = z.infer<
  typeof airlinePointsSimulationModeSchema
>;
export type AirlinePointsSyncListResponse = z.infer<
  typeof airlinePointsSyncListResponseSchema
>;
export type AirlinePointsSyncMode = z.infer<
  typeof airlinePointsSyncModeSchema
>;
export type AirlinePointsSyncRecord = z.infer<
  typeof airlinePointsSyncRecordSchema
>;
export type AirlinePointsSyncStatus = z.infer<
  typeof airlinePointsSyncStatusSchema
>;
export type PointsAirlineSyncSummary = z.infer<
  typeof pointsAirlineSyncSummarySchema
>;
