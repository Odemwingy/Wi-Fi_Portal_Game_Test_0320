import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import {
  buildAirlinePointsIdempotencyKey,
  AirlinePointsService
} from "./airline-points.service";
import {
  LegacyBatchAirlinePointsAdapter,
  MockHttpAirlinePointsAdapter
} from "./airline-points.adapter";
import {
  AirlinePointsConfigRepository,
  StateStoreAirlinePointsConfigRepository
} from "./repositories/airline-points-config.repository";
import {
  AirlinePointsSyncRepository,
  StateStoreAirlinePointsSyncRepository,
  createAirlinePointsSyncId
} from "./repositories/airline-points-sync.repository";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";

describe("AirlinePointsService", () => {
  it("syncs realtime airline points and deduplicates by idempotency key", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const configRepository: AirlinePointsConfigRepository =
      new StateStoreAirlinePointsConfigRepository(stateStore);
    const syncRepository: AirlinePointsSyncRepository =
      new StateStoreAirlinePointsSyncRepository(stateStore);
    const service = new AirlinePointsService(
      configRepository,
      syncRepository,
      new MockHttpAirlinePointsAdapter(),
      new LegacyBatchAirlinePointsAdapter()
    );
    const trace = startTrace();

    const first = await service.syncReportedPoints(trace, {
      airline_code: "MU",
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-1",
      points: 24,
      reason: "completed quiz duel",
      report_id: "report-1",
      reported_at: new Date().toISOString(),
      room_id: "room-1",
      session_id: "session-1"
    });

    expect(first).toMatchObject({
      airline_code: "MU",
      attempt_count: 1,
      status: "synced",
      sync_mode: "realtime"
    });

    const duplicate = await service.syncReportedPoints(trace, {
      airline_code: "MU",
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-1",
      points: 24,
      reason: "completed quiz duel",
      report_id: "report-1",
      reported_at: new Date().toISOString(),
      room_id: "room-1",
      session_id: "session-1"
    });

    expect(duplicate).toEqual(first);

    const records = await service.listSyncRecords(trace, {
      airline_code: "MU"
    });
    expect(records.entries).toHaveLength(1);
  });

  it("records retryable failures and allows manual retry", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const configRepository: AirlinePointsConfigRepository =
      new StateStoreAirlinePointsConfigRepository(stateStore);
    const syncRepository: AirlinePointsSyncRepository =
      new StateStoreAirlinePointsSyncRepository(stateStore);
    const service = new AirlinePointsService(
      configRepository,
      syncRepository,
      new MockHttpAirlinePointsAdapter(),
      new LegacyBatchAirlinePointsAdapter()
    );
    const trace = startTrace();

    await service.updateConfig(trace, {
      airline_code: "MU",
      api_base_url: "https://demo-airline.invalid/points",
      auth_credential: "demo-token",
      auth_type: "bearer",
      enabled: true,
      field_mapping: {
        member_id: "passenger_id",
        request_id: "report_id"
      },
      points_multiplier: 1,
      provider: "mock-http",
      retry_policy: {
        base_backoff_seconds: 5,
        max_attempts: 3
      },
      simulation_mode: "retryable_failure",
      sync_mode: "realtime"
    });

    const first = await service.syncReportedPoints(trace, {
      airline_code: "MU",
      game_id: "word-rally",
      metadata: {},
      passenger_id: "passenger-2",
      points: 18,
      reason: "completed word rally",
      report_id: "report-2",
      reported_at: new Date().toISOString(),
      room_id: null,
      session_id: "session-2"
    });

    expect(first).toMatchObject({
      attempt_count: 1,
      status: "failed"
    });
    expect(first?.next_retry_at).not.toBeNull();

    const retried = await service.retrySync(trace, first!.sync_id);
    expect(retried).toMatchObject({
      attempt_count: 2,
      status: "synced"
    });
    expect(retried.last_error).toBeNull();
  });

  it("queues batch sync records until dispatchPending is called", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const configRepository: AirlinePointsConfigRepository =
      new StateStoreAirlinePointsConfigRepository(stateStore);
    const syncRepository: AirlinePointsSyncRepository =
      new StateStoreAirlinePointsSyncRepository(stateStore);
    const service = new AirlinePointsService(
      configRepository,
      syncRepository,
      new MockHttpAirlinePointsAdapter(),
      new LegacyBatchAirlinePointsAdapter()
    );
    const trace = startTrace();

    await service.updateConfig(trace, {
      airline_code: "CA",
      api_base_url: "https://legacy-airline.invalid/batch",
      auth_credential: "legacy-secret",
      auth_type: "api_key",
      enabled: true,
      field_mapping: {
        flight_session_id: "session_id",
        member_id: "passenger_id",
        transaction_id: "report_id"
      },
      points_multiplier: 2,
      provider: "legacy-batch",
      retry_policy: {
        base_backoff_seconds: 10,
        max_attempts: 2
      },
      simulation_mode: "success",
      sync_mode: "batch"
    });

    const queued = await service.syncReportedPoints(trace, {
      airline_code: "CA",
      game_id: "memory-match-duel",
      metadata: {},
      passenger_id: "passenger-3",
      points: 12,
      reason: "completed memory match duel",
      report_id: "report-3",
      reported_at: new Date().toISOString(),
      room_id: "room-3",
      session_id: "session-3"
    });

    expect(queued).toMatchObject({
      attempt_count: 0,
      status: "pending",
      sync_mode: "batch"
    });

    const dispatched = await service.dispatchPending(trace, {
      airline_code: "CA",
      limit: 10
    });

    expect(dispatched.processed_count).toBe(1);
    expect(dispatched.entries[0]).toMatchObject({
      airline_code: "CA",
      converted_points: 24,
      status: "synced"
    });
  });

  it("derives a stable sync id from the report identity", () => {
    const idempotencyKey = buildAirlinePointsIdempotencyKey({
      airline_code: "MU",
      passenger_id: "passenger-4",
      report_id: "report-4",
      session_id: "session-4"
    });

    expect(createAirlinePointsSyncId(idempotencyKey)).toBe(
      createAirlinePointsSyncId(idempotencyKey)
    );
  });
});
