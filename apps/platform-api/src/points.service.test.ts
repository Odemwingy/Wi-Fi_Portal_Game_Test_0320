import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { PointsService } from "./points.service";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import { PointsRepository, StateStorePointsRepository } from "./repositories/points.repository";

describe("PointsService", () => {
  it("records points reports, aggregates totals, and deduplicates by report id", async () => {
    const repository: PointsRepository = new StateStorePointsRepository(
      new InMemoryJsonStateStore()
    );
    const service = new PointsService(repository);
    const trace = startTrace();

    const firstReport = await service.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {
        round_count: 3
      },
      passenger_id: "passenger-1",
      points: 20,
      reason: "quiz duel completed",
      report_id: "report-quiz-1",
      room_id: "room-1",
      session_id: "sess-1"
    });

    expect(firstReport.summary.total_points).toBe(20);
    expect(firstReport.summary.by_game).toEqual({
      "quiz-duel": 20
    });

    const duplicateReport = await service.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-1",
      points: 20,
      reason: "quiz duel completed",
      report_id: "report-quiz-1",
      room_id: "room-1",
      session_id: "sess-1"
    });

    expect(duplicateReport.summary.total_points).toBe(20);
    expect(duplicateReport.summary.latest_reports).toHaveLength(1);

    const secondReport = await service.reportPoints(trace, {
      game_id: "cabin-puzzle",
      metadata: {
        move_count: 7
      },
      passenger_id: "passenger-1",
      points: 18,
      reason: "cabin puzzle solved",
      report_id: "report-puzzle-1",
      session_id: "sess-1"
    });

    expect(secondReport.summary.total_points).toBe(38);
    expect(secondReport.summary.by_game).toEqual({
      "cabin-puzzle": 18,
      "quiz-duel": 20
    });
    expect(secondReport.summary.latest_reports[0]).toMatchObject({
      game_id: "cabin-puzzle",
      points: 18
    });

    const summary = await service.getPassengerSummary(trace, "passenger-1");
    expect(summary.total_points).toBe(38);
    expect(summary.latest_reports).toHaveLength(2);
  });

  it("builds a leaderboard ordered by total points and capped by limit", async () => {
    const repository: PointsRepository = new StateStorePointsRepository(
      new InMemoryJsonStateStore()
    );
    const service = new PointsService(repository);
    const trace = startTrace();

    await service.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-a",
      points: 18,
      reason: "quiz duel completed",
      report_id: "report-a-1",
      session_id: "sess-a"
    });
    await service.reportPoints(trace, {
      game_id: "cabin-puzzle",
      metadata: {},
      passenger_id: "passenger-b",
      points: 26,
      reason: "cabin puzzle solved",
      report_id: "report-b-1",
      session_id: "sess-b"
    });
    await service.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-c",
      points: 12,
      reason: "quiz duel completed",
      report_id: "report-c-1",
      session_id: "sess-c"
    });

    const leaderboard = await service.getLeaderboard(trace, "2");

    expect(leaderboard.limit).toBe(2);
    expect(leaderboard.entries).toHaveLength(2);
    expect(leaderboard.entries.map((entry) => entry.passenger_id)).toEqual([
      "passenger-b",
      "passenger-a"
    ]);
    expect(leaderboard.entries[0]).toMatchObject({
      latest_report: {
        game_id: "cabin-puzzle"
      },
      rank: 1,
      total_points: 26
    });
    expect(leaderboard.entries[1]).toMatchObject({
      rank: 2,
      total_points: 18
    });
  });
});
