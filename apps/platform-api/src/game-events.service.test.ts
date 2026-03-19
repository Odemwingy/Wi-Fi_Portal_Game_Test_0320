import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { GameEventsService } from "./game-events.service";
import {
  GameEventsRepository,
  StateStoreGameEventsRepository
} from "./repositories/game-events.repository";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";

describe("GameEventsService", () => {
  it("records standard game events, deduplicates by event id, and lists them with filters", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const repository: GameEventsRepository =
      new StateStoreGameEventsRepository(stateStore);
    const service = new GameEventsService(repository);
    const trace = startTrace();

    const first = await service.reportEvent(trace, {
      event_id: "evt-1",
      event_type: "game_start",
      game_id: "quiz-duel",
      passenger_id: "passenger-1",
      session_id: "sess-1"
    });

    expect(first.deduplicated).toBe(false);
    expect(first.event.event_type).toBe("game_start");

    const duplicate = await service.reportEvent(trace, {
      event_id: "evt-1",
      event_type: "game_start",
      game_id: "quiz-duel",
      passenger_id: "passenger-1",
      session_id: "sess-1"
    });

    expect(duplicate.deduplicated).toBe(true);

    await service.reportEvent(trace, {
      duration_seconds: 185,
      event_id: "evt-2",
      event_type: "duration",
      game_id: "quiz-duel",
      passenger_id: "passenger-1",
      room_id: "room-1",
      session_id: "sess-1"
    });
    await service.reportEvent(trace, {
      event_id: "evt-3",
      event_type: "score",
      game_id: "quiz-duel",
      passenger_id: "passenger-1",
      room_id: "room-1",
      score_value: 28,
      session_id: "sess-1"
    });

    const filtered = await service.listEvents(trace, {
      event_type: "score",
      game_id: "quiz-duel",
      passenger_id: "passenger-1"
    });

    expect(filtered.entries).toHaveLength(1);
    expect(filtered.entries[0]).toMatchObject({
      event_id: "evt-3",
      score_value: 28
    });
  });

  it("builds a leaderboard from standard score events and keeps latest result metadata", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const repository: GameEventsRepository =
      new StateStoreGameEventsRepository(stateStore);
    const service = new GameEventsService(repository);
    const trace = startTrace();

    await service.reportEvent(trace, {
      event_id: "leader-1",
      event_type: "score",
      game_id: "word-rally",
      passenger_id: "passenger-a",
      score_value: 32,
      session_id: "sess-a"
    });
    await service.reportEvent(trace, {
      event_id: "leader-2",
      event_type: "result",
      game_id: "word-rally",
      passenger_id: "passenger-a",
      result: "win",
      session_id: "sess-a"
    });
    await service.reportEvent(trace, {
      event_id: "leader-3",
      event_type: "duration",
      duration_seconds: 240,
      game_id: "word-rally",
      passenger_id: "passenger-a",
      session_id: "sess-a"
    });
    await service.reportEvent(trace, {
      event_id: "leader-4",
      event_type: "score",
      game_id: "word-rally",
      passenger_id: "passenger-b",
      score_value: 18,
      session_id: "sess-b"
    });

    const leaderboard = await service.getLeaderboard(trace, {
      game_id: "word-rally",
      limit: "2"
    });

    expect(leaderboard.entries).toHaveLength(2);
    expect(leaderboard.entries[0]).toMatchObject({
      latest_result: "win",
      passenger_id: "passenger-a",
      rank: 1,
      total_duration_seconds: 240,
      total_score: 32
    });
    expect(leaderboard.entries[1]).toMatchObject({
      passenger_id: "passenger-b",
      rank: 2,
      total_score: 18
    });
  });
});
