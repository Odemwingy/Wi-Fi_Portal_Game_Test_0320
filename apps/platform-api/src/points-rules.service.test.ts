import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import {
  buildDefaultPointsRuleSet,
  inferPointsEventType,
  PointsRulesService
} from "./points-rules.service";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import {
  PointsAuditRepository,
  StateStorePointsAuditRepository
} from "./repositories/points-audit.repository";
import {
  PointsRuleConfigRepository,
  StateStorePointsRuleConfigRepository
} from "./repositories/points-rule-config.repository";

describe("PointsRulesService", () => {
  it("keeps the current passthrough behavior by default", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const configRepository: PointsRuleConfigRepository =
      new StateStorePointsRuleConfigRepository(stateStore);
    const auditRepository: PointsAuditRepository =
      new StateStorePointsAuditRepository(stateStore);
    const service = new PointsRulesService(configRepository, auditRepository);
    const trace = startTrace();

    const evaluation = await service.evaluateReport(trace, {
      airline_code: "MU",
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-1",
      points: 20,
      reason: "quiz duel completed",
      report_id: "report-1",
      reported_at: new Date().toISOString(),
      room_id: "room-1",
      session_id: "session-1"
    });

    expect(evaluation.awarded_points).toBe(20);
    expect(evaluation.audit_entry.applied_rule_ids).toEqual(["requested-points"]);
  });

  it("supports configurable duration, winner, room and entry bonuses", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const configRepository: PointsRuleConfigRepository =
      new StateStorePointsRuleConfigRepository(stateStore);
    const auditRepository: PointsAuditRepository =
      new StateStorePointsAuditRepository(stateStore);
    const service = new PointsRulesService(configRepository, auditRepository);
    const trace = startTrace();

    const customConfig = buildDefaultPointsRuleSet("MU", "word-rally");
    customConfig.rules = customConfig.rules.map((rule) =>
      rule.id === "requested-points"
        ? rule
        : rule.id === "duration-minutes"
          ? {
              ...rule,
              applies_to_events: ["result"],
              enabled: true
            }
        : {
            ...rule,
            enabled: true
          }
    );
    customConfig.max_points_per_report = 40;
    await configRepository.set(customConfig);

    const evaluation = await service.evaluateReport(trace, {
      airline_code: "MU",
      game_id: "word-rally",
      metadata: {
        duration_minutes: 8,
        event_type: "result",
        is_winner: true
      },
      passenger_id: "passenger-2",
      points: 18,
      reason: "word rally completed",
      report_id: "report-2",
      reported_at: new Date().toISOString(),
      room_id: "room-2",
      session_id: "session-2"
    });

    expect(evaluation.awarded_points).toBe(40);
    expect(evaluation.audit_entry.applied_rule_ids).toEqual([
      "requested-points",
      "duration-minutes",
      "winner-bonus",
      "multiplayer-bonus"
    ]);

    const audit = await service.listAuditEntries(trace, {
      passenger_id: "passenger-2"
    });
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].awarded_points).toBe(40);
  });

  it("classifies report event types from metadata", () => {
    expect(
      inferPointsEventType({
        airline_code: null,
        game_id: "game-1",
        metadata: {
          event_type: "entry"
        },
        passenger_id: "passenger-1",
        points: 0,
        reason: "entered game",
        report_id: "report-a",
        reported_at: new Date().toISOString(),
        room_id: null,
        session_id: "session-a"
      })
    ).toBe("entry");

    expect(
      inferPointsEventType({
        airline_code: null,
        game_id: "game-1",
        metadata: {
          duration_minutes: 5
        },
        passenger_id: "passenger-1",
        points: 0,
        reason: "played for five minutes",
        report_id: "report-b",
        reported_at: new Date().toISOString(),
        room_id: null,
        session_id: "session-b"
      })
    ).toBe("duration");
  });
});
