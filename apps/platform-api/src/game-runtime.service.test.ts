import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { QuizDuelAdapter } from "./game-adapters/quiz-duel.adapter";
import { GameRuntimeService } from "./game-runtime.service";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import { StateStoreQuizDuelStateRepository } from "./repositories/quiz-duel-state.repository";
import { StateStoreRoomRepository } from "./repositories/room.repository";
import { RoomService } from "./room.service";

describe("GameRuntimeService", () => {
  it("creates quiz-duel runtime state from room lifecycle and advances through all rounds", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const roomService = new RoomService(new StateStoreRoomRepository(stateStore));
    const runtime = new GameRuntimeService(
      roomService,
      new QuizDuelAdapter(new StateStoreQuizDuelStateRepository(stateStore))
    );
    const trace = startTrace();

    const created = await roomService.createRoom(trace, {
      game_id: "quiz-duel",
      host_player_id: "host-1",
      host_session_id: "sess-host-1",
      max_players: 2,
      room_name: "Quiz Runtime Room"
    });

    await roomService.joinRoom(trace, {
      player_id: "player-2",
      room_id: created.room.room_id,
      session_id: "sess-player-2"
    });

    const initialSnapshot = await runtime.getGameSnapshot(
      trace,
      "quiz-duel",
      created.room.room_id
    );
    expect(initialSnapshot?.state.scores).toEqual({
      "host-1": 0,
      "player-2": 0
    });
    expect(initialSnapshot?.state.prompt).toMatchObject({
      id: "safety-briefing-001",
      title: "Cabin Safety Quickfire"
    });

    const updatedSnapshot = await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "A"
      },
      playerId: "player-2",
      roomId: created.room.room_id,
      seq: 1,
      type: "game_event"
    });

    expect(updatedSnapshot?.state.scores).toEqual({
      "host-1": 0,
      "player-2": 10
    });
    expect(updatedSnapshot?.state.answer_count).toBe(1);
    expect(updatedSnapshot?.state.answers_by_player).toEqual({
      "host-1": null,
      "player-2": "A"
    });

    const duplicateAttempt = await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "A"
      },
      playerId: "player-2",
      roomId: created.room.room_id,
      seq: 2,
      type: "game_event"
    });

    expect(duplicateAttempt?.state.scores).toEqual({
      "host-1": 0,
      "player-2": 10
    });
    expect(duplicateAttempt?.state.answer_count).toBe(1);

    const roundOneCompleted = await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "B"
      },
      playerId: "host-1",
      roomId: created.room.room_id,
      seq: 1,
      type: "game_event"
    });

    expect(roundOneCompleted?.state.current_round_number).toBe(2);
    expect(roundOneCompleted?.state.completed_round_count).toBe(1);
    expect(roundOneCompleted?.state.prompt).toMatchObject({
      id: "cabin-signals-002",
      title: "Turbulence Signals"
    });
    expect(roundOneCompleted?.state.last_completed_round).toMatchObject({
      correctAnswer: "A",
      roundNumber: 1,
      winningPlayerIds: ["player-2"]
    });
    expect(roundOneCompleted?.state.answers_by_player).toEqual({
      "host-1": null,
      "player-2": null
    });

    await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "C"
      },
      playerId: "host-1",
      roomId: created.room.room_id,
      seq: 2,
      type: "game_event"
    });

    const roundTwoCompleted = await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "B"
      },
      playerId: "player-2",
      roomId: created.room.room_id,
      seq: 3,
      type: "game_event"
    });

    expect(roundTwoCompleted?.state.current_round_number).toBe(3);
    expect(roundTwoCompleted?.state.completed_round_count).toBe(2);
    expect(roundTwoCompleted?.state.prompt).toMatchObject({
      id: "device-mode-003",
      title: "Connected Cabin Etiquette"
    });
    expect(roundTwoCompleted?.state.last_completed_round).toMatchObject({
      correctAnswer: "C",
      roundNumber: 2,
      winningPlayerIds: ["host-1", "player-2"]
    });
    expect(roundTwoCompleted?.state.scores).toEqual({
      "host-1": 10,
      "player-2": 10
    });

    await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "D"
      },
      playerId: "host-1",
      roomId: created.room.room_id,
      seq: 3,
      type: "game_event"
    });

    const finalSnapshot = await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "A"
      },
      playerId: "player-2",
      roomId: created.room.room_id,
      seq: 4,
      type: "game_event"
    });

    expect(finalSnapshot?.state.is_completed).toBe(true);
    expect(finalSnapshot?.state.completed_round_count).toBe(3);
    expect(finalSnapshot?.state.total_rounds).toBe(3);
    expect(finalSnapshot?.state.last_completed_round).toMatchObject({
      correctAnswer: "D",
      roundNumber: 3,
      winningPlayerIds: ["host-1"]
    });
    expect(finalSnapshot?.state.round_history).toHaveLength(3);
    expect(finalSnapshot?.state.scores).toEqual({
      "host-1": 20,
      "player-2": 10
    });
    expect(finalSnapshot?.state.winning_player_ids).toEqual(["host-1"]);

    runtime.onModuleDestroy();
  });
});
