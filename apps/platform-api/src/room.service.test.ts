import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import { StateStoreRoomRepository } from "./repositories/room.repository";
import { RoomService } from "./room.service";

describe("RoomService", () => {
  it("creates a room and allows a second player to join and ready up", async () => {
    const service = new RoomService(
      new StateStoreRoomRepository(new InMemoryJsonStateStore())
    );
    const trace = startTrace();

    const created = await service.createRoom(trace, {
      game_id: "quiz-duel",
      host_player_id: "host-1",
      host_session_id: "sess-host-1",
      room_name: "Demo Room",
      max_players: 2
    });

    const joined = await service.joinRoom(trace, {
      room_id: created.room.room_id,
      player_id: "player-2",
      session_id: "sess-player-2"
    });

    const ready = await service.setReady(trace, {
      room_id: joined.room.room_id,
      player_id: "player-2",
      ready: true
    });

    expect(ready.room.players).toHaveLength(2);
    expect(ready.room.status).toBe("ready");
  });

  it("marks a disconnected player and restores them inside the reconnect window", async () => {
    const service = new RoomService(
      new StateStoreRoomRepository(new InMemoryJsonStateStore())
    );
    const trace = startTrace();

    const created = await service.createRoom(trace, {
      game_id: "quiz-duel",
      host_player_id: "host-1",
      host_session_id: "sess-host-1",
      room_name: "Reconnect Room",
      max_players: 2
    });

    await service.joinRoom(trace, {
      room_id: created.room.room_id,
      player_id: "player-2",
      session_id: "sess-player-2"
    });

    const disconnected = await service.disconnect(
      trace,
      created.room.room_id,
      "player-2"
    );
    expect(
      disconnected.room.players.find((player) => player.player_id === "player-2")
        ?.connection_status
    ).toBe("disconnected");

    const reconnected = await service.reconnect(trace, {
      room_id: created.room.room_id,
      player_id: "player-2",
      session_id: "sess-player-2b"
    });

    expect(
      reconnected.room.players.find((player) => player.player_id === "player-2")
        ?.connection_status
    ).toBe("connected");
  });

  it("joins a room by invite code and normalizes the code casing", async () => {
    const service = new RoomService(
      new StateStoreRoomRepository(new InMemoryJsonStateStore())
    );
    const trace = startTrace();

    const created = await service.createRoom(trace, {
      game_id: "quiz-duel",
      host_player_id: "host-1",
      host_session_id: "sess-host-1",
      room_name: "Invite Room",
      max_players: 4
    });

    const joined = await service.joinRoomByInvite(trace, {
      invite_code: created.room.invite_code.toLowerCase(),
      player_id: "player-3",
      session_id: "sess-player-3"
    });

    expect(joined.room.room_id).toBe(created.room.room_id);
    expect(
      joined.room.players.some((player) => player.player_id === "player-3")
    ).toBe(true);
  });
});
