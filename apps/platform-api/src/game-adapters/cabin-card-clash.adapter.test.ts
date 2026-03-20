import { describe, expect, it } from "vitest";

import type { GameEventEnvelope } from "@wifi-portal/game-sdk";

import { CabinCardClashAdapter } from "./cabin-card-clash.adapter";
import {
  CabinCardClashStateRepository,
  type CabinCardClashRoomState
} from "../repositories/cabin-card-clash-state.repository";

class CloningCabinCardClashStateRepository extends CabinCardClashStateRepository {
  private readonly rooms = new Map<string, CabinCardClashRoomState>();

  async delete(roomId: string) {
    this.rooms.delete(roomId);
  }

  async get(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? this.clone(room) : undefined;
  }

  async set(roomId: string, state: CabinCardClashRoomState) {
    const cloned = this.clone(state);
    this.rooms.set(roomId, cloned);
    return this.clone(cloned);
  }

  private clone(state: CabinCardClashRoomState) {
    return JSON.parse(JSON.stringify(state)) as CabinCardClashRoomState;
  }
}

describe("CabinCardClashAdapter", () => {
  it("persists hands, round results, and score updates with detached repository reads", async () => {
    const repository = new CloningCabinCardClashStateRepository();
    const adapter = new CabinCardClashAdapter(repository);
    const roomId = "room-card-clash";

    await adapter.createMatch(roomId, "host-1");
    await adapter.joinMatch(roomId, "player-2");

    const initialSnapshot = await adapter.getSnapshot(roomId);
    expect(initialSnapshot.state.players).toEqual(["host-1", "player-2"]);
    expect(initialSnapshot.state.hands_by_player["host-1"]).toHaveLength(4);

    await adapter.handlePlayerAction({
      gameId: "cabin-card-clash",
      payload: { cardId: "host-window-kit" },
      playerId: "host-1",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);

    await adapter.handlePlayerAction({
      gameId: "cabin-card-clash",
      payload: { cardId: "guest-juice" },
      playerId: "player-2",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);

    const updatedSnapshot = await adapter.getSnapshot(roomId);
    expect(updatedSnapshot.state.current_round_number).toBe(2);
    expect(updatedSnapshot.state.last_round_result).toMatchObject({
      roundNumber: 1,
      winnerPlayerIds: ["host-1"]
    });
    expect(updatedSnapshot.state.scores).toEqual({
      "host-1": 3,
      "player-2": 0
    });

    await adapter.reconnectPlayer(roomId, "player-2");
    const reconnectedSnapshot = await adapter.getSnapshot(roomId);
    expect(reconnectedSnapshot.state.players).toEqual(["host-1", "player-2"]);
  });
});
