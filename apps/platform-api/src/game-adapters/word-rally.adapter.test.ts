import { describe, expect, it } from "vitest";

import type { GameEventEnvelope } from "@wifi-portal/game-sdk";

import { WordRallyAdapter } from "./word-rally.adapter";
import {
  WordRallyStateRepository,
  type WordRallyRoomState
} from "../repositories/word-rally-state.repository";

class CloningWordRallyStateRepository extends WordRallyStateRepository {
  private readonly rooms = new Map<string, WordRallyRoomState>();

  async delete(roomId: string) {
    this.rooms.delete(roomId);
  }

  async get(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? this.clone(room) : undefined;
  }

  async set(roomId: string, state: WordRallyRoomState) {
    const cloned = this.clone(state);
    this.rooms.set(roomId, cloned);
    return this.clone(cloned);
  }

  private clone(state: WordRallyRoomState) {
    return JSON.parse(JSON.stringify(state)) as WordRallyRoomState;
  }
}

describe("WordRallyAdapter", () => {
  it("persists room membership and submitted answers with detached repository reads", async () => {
    const repository = new CloningWordRallyStateRepository();
    const adapter = new WordRallyAdapter(repository);
    const roomId = "room-word-rally";

    await adapter.createMatch(roomId, "host-1");
    await adapter.joinMatch(roomId, "player-2");

    const initialSnapshot = await adapter.getSnapshot(roomId);
    expect(initialSnapshot.state.players).toEqual(["host-1", "player-2"]);

    await adapter.handlePlayerAction({
      gameId: "word-rally",
      payload: {
        wordId: "cloud"
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
      "player-2": "cloud"
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
