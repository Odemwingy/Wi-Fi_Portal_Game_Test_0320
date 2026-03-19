import { describe, expect, it } from "vitest";

import type { GameEventEnvelope } from "@wifi-portal/game-sdk";

import { MemoryMatchDuelAdapter } from "./memory-match-duel.adapter";
import {
  MemoryMatchDuelStateRepository,
  type MemoryMatchRoomState
} from "../repositories/memory-match-duel-state.repository";

class CloningMemoryMatchStateRepository extends MemoryMatchDuelStateRepository {
  private readonly rooms = new Map<string, MemoryMatchRoomState>();

  async delete(roomId: string) {
    this.rooms.delete(roomId);
  }

  async get(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? this.clone(room) : undefined;
  }

  async set(roomId: string, state: MemoryMatchRoomState) {
    const cloned = this.clone(state);
    this.rooms.set(roomId, cloned);
    return this.clone(cloned);
  }

  private clone(state: MemoryMatchRoomState) {
    return JSON.parse(JSON.stringify(state)) as MemoryMatchRoomState;
  }
}

describe("MemoryMatchDuelAdapter", () => {
  it("persists revealed cards, resolves a pair, and rotates turn on mismatch", async () => {
    const repository = new CloningMemoryMatchStateRepository();
    const adapter = new MemoryMatchDuelAdapter(repository);
    const roomId = "room-memory-match";

    await adapter.createMatch(roomId, "host-1");
    await adapter.joinMatch(roomId, "player-2");

    await adapter.handlePlayerAction({
      gameId: "memory-match-duel",
      payload: { cardIndex: 0 },
      playerId: "host-1",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);

    const afterFirstReveal = await adapter.getSnapshot(roomId);
    expect(afterFirstReveal.state.selection).toEqual([0]);
    expect((afterFirstReveal.state.board as Array<{ status: string }>)[0]?.status).toBe(
      "revealed"
    );

    await adapter.handlePlayerAction({
      gameId: "memory-match-duel",
      payload: { cardIndex: 2 },
      playerId: "host-1",
      roomId,
      seq: 2,
      type: "game_event"
    } satisfies GameEventEnvelope);

    const afterMatch = await adapter.getSnapshot(roomId);
    expect(afterMatch.state.matched_pair_count).toBe(1);
    expect(afterMatch.state.scores).toEqual({
      "host-1": 12,
      "player-2": 0
    });
    expect((afterMatch.state.board as Array<{ status: string }>)[0]?.status).toBe("matched");
    expect((afterMatch.state.board as Array<{ status: string }>)[2]?.status).toBe("matched");

    await adapter.handlePlayerAction({
      gameId: "memory-match-duel",
      payload: { cardIndex: 1 },
      playerId: "host-1",
      roomId,
      seq: 3,
      type: "game_event"
    } satisfies GameEventEnvelope);
    await adapter.handlePlayerAction({
      gameId: "memory-match-duel",
      payload: { cardIndex: 3 },
      playerId: "host-1",
      roomId,
      seq: 4,
      type: "game_event"
    } satisfies GameEventEnvelope);

    const afterMismatch = await adapter.getSnapshot(roomId);
    expect(afterMismatch.state.current_turn_player_id).toBe("player-2");
    expect((afterMismatch.state.board as Array<{ status: string }>)[1]?.status).toBe("hidden");
    expect((afterMismatch.state.board as Array<{ status: string }>)[3]?.status).toBe("hidden");
  });
});
