import { z } from "zod";

export const pointsEventTypeSchema = z.enum([
  "entry",
  "completion",
  "duration",
  "result",
  "any"
]);

export const pointsRuleKindSchema = z.enum([
  "requested_points_multiplier",
  "metadata_number_multiplier",
  "metadata_boolean_bonus",
  "flat_bonus"
]);

export const pointsRuleSchema = z.object({
  applies_to_events: z.array(pointsEventTypeSchema).min(1),
  boolean_match: z.boolean().optional(),
  enabled: z.boolean(),
  id: z.string().min(1),
  kind: pointsRuleKindSchema,
  label: z.string().min(1),
  max_points: z.number().int().positive().optional(),
  metadata_key: z.string().min(1).optional(),
  multiplier: z.number().positive().optional(),
  points: z.number().int().nonnegative().optional(),
  require_room: z.boolean().optional()
});

export const pointsRuleSetSchema = z.object({
  airline_code: z.string().min(2).max(8),
  game_id: z.string().min(1),
  max_points_per_report: z.number().int().positive().optional(),
  rules: z.array(pointsRuleSchema),
  updated_at: z.string().min(1)
});

export const pointsRuleSetUpsertRequestSchema = z.object({
  airline_code: z.string().min(2).max(8),
  game_id: z.string().min(1),
  max_points_per_report: z.number().int().positive().optional(),
  rules: z.array(pointsRuleSchema)
});

export const pointsAwardBreakdownEntrySchema = z.object({
  awarded_points: z.number().int().nonnegative(),
  detail: z.string().min(1),
  label: z.string().min(1),
  rule_id: z.string().min(1)
});

export const pointsAuditEntrySchema = z.object({
  airline_code: z.string().min(2).max(8).nullable(),
  applied_rule_ids: z.array(z.string().min(1)),
  audit_id: z.string().min(1),
  awarded_points: z.number().int().nonnegative(),
  breakdown: z.array(pointsAwardBreakdownEntrySchema),
  created_at: z.string().min(1),
  event_type: pointsEventTypeSchema,
  game_id: z.string().min(1),
  metadata: z.record(z.unknown()),
  passenger_id: z.string().min(1),
  reason: z.string().min(1),
  report_id: z.string().min(1),
  requested_points: z.number().int().nonnegative(),
  room_id: z.string().min(1).nullable(),
  session_id: z.string().min(1)
});

export const pointsAuditListResponseSchema = z.object({
  entries: z.array(pointsAuditEntrySchema),
  trace_id: z.string().min(1)
});

export type PointsAuditEntry = z.infer<typeof pointsAuditEntrySchema>;
export type PointsAuditListResponse = z.infer<typeof pointsAuditListResponseSchema>;
export type PointsAwardBreakdownEntry = z.infer<
  typeof pointsAwardBreakdownEntrySchema
>;
export type PointsEventType = z.infer<typeof pointsEventTypeSchema>;
export type PointsRule = z.infer<typeof pointsRuleSchema>;
export type PointsRuleKind = z.infer<typeof pointsRuleKindSchema>;
export type PointsRuleSet = z.infer<typeof pointsRuleSetSchema>;
export type PointsRuleSetUpsertRequest = z.infer<
  typeof pointsRuleSetUpsertRequestSchema
>;
