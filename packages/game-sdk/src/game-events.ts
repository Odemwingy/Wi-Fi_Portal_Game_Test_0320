import { z } from "zod";

export const gameStandardEventTypeSchema = z.enum([
  "game_start",
  "game_end",
  "score",
  "duration",
  "result"
]);

export const gameResultOutcomeSchema = z.enum([
  "win",
  "loss",
  "draw",
  "completed",
  "abandoned"
]);

export const gameEventReportRequestSchema = z.object({
  airline_code: z.string().min(2).max(8).optional(),
  duration_seconds: z.number().int().nonnegative().optional(),
  event_id: z.string().min(1),
  event_type: gameStandardEventTypeSchema,
  game_id: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  occurred_at: z.string().min(1).optional(),
  passenger_id: z.string().min(1),
  result: gameResultOutcomeSchema.optional(),
  room_id: z.string().min(1).optional(),
  score_value: z.number().int().nonnegative().optional(),
  session_id: z.string().min(1)
});

export const gameEventRecordSchema = z.object({
  airline_code: z.string().min(2).max(8).nullable(),
  duration_seconds: z.number().int().nonnegative().nullable(),
  event_id: z.string().min(1),
  event_type: gameStandardEventTypeSchema,
  game_id: z.string().min(1),
  metadata: z.record(z.unknown()),
  occurred_at: z.string().min(1),
  passenger_id: z.string().min(1),
  recorded_at: z.string().min(1),
  result: gameResultOutcomeSchema.nullable(),
  room_id: z.string().min(1).nullable(),
  score_value: z.number().int().nonnegative().nullable(),
  session_id: z.string().min(1)
});

export const gameEventReportResponseSchema = z.object({
  event: gameEventRecordSchema,
  deduplicated: z.boolean(),
  trace_id: z.string().min(1)
});

export const gameEventListResponseSchema = z.object({
  entries: z.array(gameEventRecordSchema),
  trace_id: z.string().min(1)
});

export const gameEventLeaderboardEntrySchema = z.object({
  events_count: z.number().int().nonnegative(),
  latest_result: gameResultOutcomeSchema.nullable(),
  last_event_at: z.string().min(1),
  passenger_id: z.string().min(1),
  rank: z.number().int().positive(),
  score_by_game: z.record(z.number().int().nonnegative()),
  total_duration_seconds: z.number().int().nonnegative(),
  total_score: z.number().int().nonnegative()
});

export const gameEventLeaderboardResponseSchema = z.object({
  entries: z.array(gameEventLeaderboardEntrySchema),
  game_id: z.string().min(1).nullable(),
  generated_at: z.string().min(1),
  limit: z.number().int().positive(),
  trace_id: z.string().min(1)
});

export type GameEventLeaderboardEntry = z.infer<
  typeof gameEventLeaderboardEntrySchema
>;
export type GameEventLeaderboardResponse = z.infer<
  typeof gameEventLeaderboardResponseSchema
>;
export type GameEventListResponse = z.infer<typeof gameEventListResponseSchema>;
export type GameEventRecord = z.infer<typeof gameEventRecordSchema>;
export type GameEventReportRequest = z.infer<typeof gameEventReportRequestSchema>;
export type GameEventReportResponse = z.infer<
  typeof gameEventReportResponseSchema
>;
export type GameResultOutcome = z.infer<typeof gameResultOutcomeSchema>;
export type GameStandardEventType = z.infer<typeof gameStandardEventTypeSchema>;
