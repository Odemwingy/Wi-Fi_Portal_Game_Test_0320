import { z } from "zod";

import { pointsAirlineSyncSummarySchema } from "./airline-points";
import { pointsAuditEntrySchema } from "./points-rules";

export const pointsReportRequestSchema = z.object({
  airline_code: z.string().min(2).max(8).optional(),
  game_id: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  passenger_id: z.string().min(1),
  points: z.number().int().nonnegative(),
  reason: z.string().min(1).max(120),
  report_id: z.string().min(1),
  room_id: z.string().min(1).optional(),
  session_id: z.string().min(1)
});

export const pointsReportRecordSchema = z.object({
  airline_code: z.string().min(2).max(8).nullable(),
  game_id: z.string().min(1),
  metadata: z.record(z.unknown()),
  passenger_id: z.string().min(1),
  points: z.number().int().nonnegative(),
  reason: z.string().min(1),
  report_id: z.string().min(1),
  room_id: z.string().min(1).nullable(),
  session_id: z.string().min(1),
  reported_at: z.string().min(1)
});

export const passengerPointsSummarySchema = z.object({
  by_game: z.record(z.number().int().nonnegative()),
  latest_reports: z.array(pointsReportRecordSchema),
  passenger_id: z.string().min(1),
  total_points: z.number().int().nonnegative(),
  updated_at: z.string().min(1)
});

export const pointsLeaderboardEntrySchema = z.object({
  by_game: z.record(z.number().int().nonnegative()),
  latest_report: pointsReportRecordSchema.nullable(),
  passenger_id: z.string().min(1),
  rank: z.number().int().positive(),
  total_points: z.number().int().nonnegative(),
  updated_at: z.string().min(1)
});

export const pointsReportResponseSchema = z.object({
  airline_sync: pointsAirlineSyncSummarySchema.nullable(),
  audit_entry: pointsAuditEntrySchema,
  summary: passengerPointsSummarySchema,
  trace_id: z.string().min(1)
});

export const pointsLeaderboardResponseSchema = z.object({
  entries: z.array(pointsLeaderboardEntrySchema),
  generated_at: z.string().min(1),
  limit: z.number().int().positive(),
  trace_id: z.string().min(1)
});

export type PointsReportRequest = z.infer<typeof pointsReportRequestSchema>;
export type PointsReportRecord = z.infer<typeof pointsReportRecordSchema>;
export type PassengerPointsSummary = z.infer<typeof passengerPointsSummarySchema>;
export type PointsLeaderboardEntry = z.infer<typeof pointsLeaderboardEntrySchema>;
export type PointsLeaderboardResponse = z.infer<typeof pointsLeaderboardResponseSchema>;
export type PointsReportResponse = z.infer<typeof pointsReportResponseSchema>;
