import { describe, expect, it } from "vitest";

import { TapBeatBattleAdapter } from "./tap-beat-battle.adapter";
import {
  TapBeatBattleStateRepository,
  type TapBeatBattleRoomState
} from "../repositories/tap-beat-battle-state.repository";

class CloningTapBeatBattleStateRepository extends TapBeatBattleStateRepository {
  private readonly rooms = new Map<string, TapBeatBattleRoomState>();

  async delete(roomId: string) {
    this.rooms.delete(roomId);
  }

  async get(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? this.clone(room) : undefined;
  }

  async set(roomId: string, state: TapBeatBattleRoomState) {
    this.rooms.set(roomId, this.clone(state));
    return this.clone(state);
  }

  private clone(state: TapBeatBattleRoomState) {
    return JSON.parse(JSON.stringify(state)) as TapBeatBattleRoomState;
  }
}

describe("TapBeatBattleAdapter", () => {
  it("scores accepted taps, advances rounds, and resolves winners", async () => {
    const repository = new CloningTapBeatBattleStateRepository();
    const adapter = new TapBeatBattleAdapter(repository);

    await adapter.createMatch("room-1", "host-1");
    await adapter.joinMatch("room-1", "player-2");

    await adapter.handlePlayerAction({
      gameId: "tap-beat-battle",
      payload: { laneId: "left" },
      playerId: "host-1",
      roomId: "room-1",
      seq: 1,
      type: "game_event"
    });
    await adapter.handlePlayerAction({
      gameId: "tap-beat-battle",
      payload: { laneId: "right" },
      playerId: "player-2",
      roomId: "room-1",
      seq: 1,
      type: "game_event"
    });
    await adapter.handlePlayerAction({
      gameId: "tap-beat-battle",
      payload: { laneId: "center" },
      playerId: "host-1",
      roomId: "room-1",
      seq: 2,
      type: "game_event"
    });
    await adapter.handlePlayerAction({
      gameId: "tap-beat-battle",
      payload: { laneId: "center" },
      playerId: "player-2",
      roomId: "room-1",
      seq: 2,
      type: "game_event"
    });
    await adapter.handlePlayerAction({
      gameId: "tap-beat-battle",
      payload: { laneId: "right" },
      playerId: "host-1",
      roomId: "room-1",
      seq: 3,
      type: "game_event"
    });
    await adapter.handlePlayerAction({
      gameId: "tap-beat-battle",
      payload: { laneId: "left" },
      playerId: "player-2",
      roomId: "room-1",
      seq: 3,
      type: "game_event"
    });

    const roundOneSnapshot = await adapter.handlePlayerAction({
      gameId: "tap-beat-battle",
      payload: { laneId: "center" },
      playerId: "host-1",
      roomId: "room-1",
      seq: 4,
      type: "game_event"
    });
    await adapter.handlePlayerAction({
      gameId: "tap-beat-battle",
      payload: { laneId: "left" },
      playerId: "player-2",
      roomId: "room-1",
      seq: 4,
      type: "game_event"
    });

    const completedRoundSnapshot = await adapter.getSnapshot("room-1");

    expect(roundOneSnapshot).toBeUndefined();
    expect(completedRoundSnapshot.state.current_round_number).toBe(2);
    expect(completedRoundSnapshot.state.last_completed_round).toMatchObject({
      roundNumber: 1,
      winnerPlayerIds: ["host-1"]
    });
    expect(completedRoundSnapshot.state.scores).toEqual({
      "host-1": 16,
      "player-2": 4
    });
  });
});
