import { describe, expect, it } from "vitest";

import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import { StateStoreRoomRepository } from "./repositories/room.repository";
import { PlatformDiagnosticsService } from "./platform-diagnostics.service";
import { PlatformMetricsService } from "./platform-metrics.service";

describe("PlatformDiagnosticsService", () => {
  it("reports readiness and metrics from the backing store and room state", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const roomRepository = new StateStoreRoomRepository(stateStore);
    const metrics = new PlatformMetricsService();
    const diagnostics = new PlatformDiagnosticsService(
      stateStore,
      roomRepository,
      metrics
    );

    await roomRepository.set({
      created_at: "2026-03-19T08:00:00.000Z",
      game_id: "quiz-duel",
      host_player_id: "host-1",
      invite_code: "ABC123",
      max_players: 2,
      players: [
        {
          connection_status: "connected",
          disconnected_at: null,
          is_host: true,
          player_id: "host-1",
          ready: true,
          reconnect_deadline_at: null,
          session_id: "sess-host"
        }
      ],
      reconnect_window_seconds: 120,
      room_id: "room-1",
      room_name: "Test Room",
      status: "waiting",
      updated_at: "2026-03-19T08:00:00.000Z"
    });

    const readiness = await diagnostics.getReadiness();
    const snapshot = await diagnostics.getMetrics();

    expect(readiness.status).toBe("ready");
    expect(readiness.dependencies.state_store.backend).toBe("memory");
    expect(snapshot.rooms.active_rooms).toBe(1);
    expect(snapshot.dependencies.state_store.status).toBe("ok");
  });
});
