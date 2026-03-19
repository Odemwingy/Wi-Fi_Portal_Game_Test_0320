import { describe, expect, it, vi } from "vitest";

import { PlatformMetricsService } from "./platform-metrics.service";

describe("PlatformMetricsService", () => {
  it("aggregates http, websocket, and room metrics into a snapshot", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T08:00:00.000Z"));

    const service = new PlatformMetricsService();

    service.recordHttpRequest({
      duration_ms: 120,
      method: "GET",
      path: "/api/health",
      status_code: 200
    });
    service.recordHttpRequest({
      duration_ms: 80,
      method: "POST",
      path: "/api/session/bootstrap",
      status_code: 201
    });
    service.recordWsConnectionOpened();
    service.recordWsMessage("received", "game_event");
    service.recordWsMessage("sent", "ack");
    service.recordWsRtt(48);

    const snapshot = service.getSnapshot({
      active_rooms: 2,
      connected_players: 3,
      disconnected_players: 1
    });

    expect(snapshot.http.requests_total).toBe(2);
    expect(snapshot.http.avg_duration_ms).toBe(100);
    expect(snapshot.websocket.active_connections).toBe(1);
    expect(snapshot.websocket.avg_rtt_ms_1m).toBe(48);
    expect(snapshot.rooms.active_rooms).toBe(2);

    vi.useRealTimers();
  });
});
