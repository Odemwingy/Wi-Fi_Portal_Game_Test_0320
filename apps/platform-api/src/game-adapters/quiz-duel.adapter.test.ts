import { describe, expect, it } from "vitest";

import type { GameEventEnvelope } from "@wifi-portal/game-sdk";

import { QuizDuelAdapter } from "./quiz-duel.adapter";
import {
  QuizDuelStateRepository,
  type QuizDuelRoomState
} from "../repositories/quiz-duel-state.repository";

class CloningQuizDuelStateRepository extends QuizDuelStateRepository {
  private readonly rooms = new Map<string, QuizDuelRoomState>();

  async delete(roomId: string) {
    this.rooms.delete(roomId);
  }

  async get(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? this.clone(room) : undefined;
  }

  async set(roomId: string, state: QuizDuelRoomState) {
    const cloned = this.clone(state);
    this.rooms.set(roomId, cloned);
    return this.clone(cloned);
  }

  private clone(state: QuizDuelRoomState) {
    return JSON.parse(JSON.stringify(state)) as QuizDuelRoomState;
  }
}

describe("QuizDuelAdapter", () => {
  it("persists room membership and answers when repository returns detached copies", async () => {
    const repository = new CloningQuizDuelStateRepository();
    const adapter = new QuizDuelAdapter(repository);
    const roomId = "room-redis-like";

    await adapter.createMatch(roomId, "host-1");
    await adapter.joinMatch(roomId, "player-2");

    const initialSnapshot = await adapter.getSnapshot(roomId);

    expect(initialSnapshot.state.players).toEqual(["host-1", "player-2"]);
    expect(initialSnapshot.state.scores).toEqual({
      "host-1": 0,
      "player-2": 0
    });

    await adapter.handlePlayerAction({
      gameId: "quiz-duel",
      payload: {
        answer: "A"
      },
      playerId: "player-2",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);

    const updatedSnapshot = await adapter.getSnapshot(roomId);

    expect(updatedSnapshot.state.answer_count).toBe(1);
    expect(updatedSnapshot.state.answers_by_player).toEqual({
      "host-1": null,
      "player-2": "A"
    });
    expect(updatedSnapshot.state.scores).toEqual({
      "host-1": 0,
      "player-2": 10
    });

    await adapter.reconnectPlayer(roomId, "player-2");

    const reconnectedSnapshot = await adapter.getSnapshot(roomId);
    expect(reconnectedSnapshot.state.players).toEqual(["host-1", "player-2"]);
  });
});
