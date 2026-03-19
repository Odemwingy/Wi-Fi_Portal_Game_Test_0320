import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import {
  pointsAuditEntrySchema,
  pointsAuditListResponseSchema,
  pointsRuleSetSchema,
  pointsRuleSetUpsertRequestSchema,
  type PointsEventType,
  type PointsReportRecord,
  type PointsRule,
  type PointsRuleSet,
  type PointsRuleSetUpsertRequest
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import { PointsAuditRepository } from "./repositories/points-audit.repository";
import { PointsRuleConfigRepository } from "./repositories/points-rule-config.repository";

const logger = createStructuredLogger("platform-api.points-rules");

@Injectable()
export class PointsRulesService {
  constructor(
    @Inject(PointsRuleConfigRepository)
    private readonly configRepository: PointsRuleConfigRepository,
    @Inject(PointsAuditRepository)
    private readonly auditRepository: PointsAuditRepository
  ) {}

  async getRuleSet(
    traceContext: TraceContext,
    airlineCode: string,
    gameId: string
  ) {
    const span = startChildSpan(traceContext);
    const config = await this.getEffectiveRuleSet(airlineCode, gameId);

    logger.info("points-rules.loaded", span, {
      input_summary: JSON.stringify({
        airline_code: airlineCode,
        game_id: gameId
      }),
      output_summary: `${config.rules.length} rules`
    });

    return config;
  }

  async upsertRuleSet(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const parsed = this.parseRuleSetPayload(payload, span);
    const config = pointsRuleSetSchema.parse({
      ...parsed,
      updated_at: new Date().toISOString()
    });
    const saved = await this.configRepository.set(config);

    logger.info("points-rules.updated", span, {
      input_summary: JSON.stringify({
        airline_code: saved.airline_code,
        game_id: saved.game_id
      }),
      output_summary: `${saved.rules.length} rules saved`,
      metadata: {
        max_points_per_report: saved.max_points_per_report ?? null
      }
    });

    return saved;
  }

  async evaluateReport(traceContext: TraceContext, report: PointsReportRecord) {
    const span = startChildSpan(traceContext);
    const airlineCode = report.airline_code ?? "MU";
    const ruleSet = await this.getEffectiveRuleSet(airlineCode, report.game_id);
    const eventType = inferPointsEventType(report);
    const breakdown = ruleSet.rules
      .filter((rule) => this.ruleApplies(rule, eventType, report))
      .map((rule) => evaluateRule(rule, report))
      .filter((entry) => entry.awarded_points > 0);

    const uncappedTotal = breakdown.reduce(
      (sum, entry) => sum + entry.awarded_points,
      0
    );
    const awardedPoints =
      ruleSet.max_points_per_report === undefined
        ? uncappedTotal
        : Math.min(uncappedTotal, ruleSet.max_points_per_report);
    const auditEntry = pointsAuditEntrySchema.parse({
      airline_code: report.airline_code,
      applied_rule_ids: breakdown.map((entry) => entry.rule_id),
      audit_id: createPointsAuditId(report.report_id),
      awarded_points: awardedPoints,
      breakdown:
        awardedPoints === uncappedTotal
          ? breakdown
          : [
              ...breakdown,
              {
                awarded_points: 0,
                detail: `Capped at ${ruleSet.max_points_per_report} points per report`,
                label: "Report cap",
                rule_id: "report-cap"
              }
            ],
      created_at: report.reported_at,
      event_type: eventType,
      game_id: report.game_id,
      metadata: report.metadata,
      passenger_id: report.passenger_id,
      reason: report.reason,
      report_id: report.report_id,
      requested_points: report.points,
      room_id: report.room_id,
      session_id: report.session_id
    });

    await this.auditRepository.append(auditEntry);

    logger.info("points-rules.evaluated", span, {
      input_summary: JSON.stringify({
        event_type: eventType,
        game_id: report.game_id,
        report_id: report.report_id
      }),
      output_summary: `${awardedPoints} awarded points`,
      metadata: {
        applied_rule_ids: auditEntry.applied_rule_ids,
        requested_points: report.points
      }
    });

    return {
      audit_entry: auditEntry,
      awarded_points: awardedPoints,
      event_type: eventType,
      rule_set: ruleSet
    };
  }

  async listAuditEntries(
    traceContext: TraceContext,
    input: {
      game_id?: string;
      limit?: string;
      passenger_id?: string;
    }
  ) {
    const span = startChildSpan(traceContext);
    const limit = parseAuditLimit(input.limit);
    const entries = await this.auditRepository.list({
      game_id: input.game_id,
      limit,
      passenger_id: input.passenger_id
    });

    logger.info("points-rules.audit.loaded", span, {
      input_summary: JSON.stringify({
        game_id: input.game_id ?? null,
        limit,
        passenger_id: input.passenger_id ?? null
      }),
      output_summary: `${entries.length} audit entries`
    });

    return pointsAuditListResponseSchema.parse({
      entries,
      trace_id: traceContext.trace_id
    });
  }

  private async getEffectiveRuleSet(airlineCode: string, gameId: string) {
    const stored = await this.configRepository.get(airlineCode, gameId);
    return stored ?? buildDefaultPointsRuleSet(airlineCode, gameId);
  }

  private parseRuleSetPayload(
    payload: unknown,
    traceContext: TraceContext
  ): PointsRuleSetUpsertRequest {
    const parsed = pointsRuleSetUpsertRequestSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn("points-rules.invalid_payload", traceContext, {
      input_summary: JSON.stringify(payload ?? {}),
      error_detail: parsed.error.message,
      status: "error"
    });

    throw new BadRequestException({
      issues: parsed.error.flatten(),
      message: "Invalid points rule set payload"
    });
  }

  private ruleApplies(
    rule: PointsRule,
    eventType: PointsEventType,
    report: PointsReportRecord
  ) {
    if (!rule.enabled) {
      return false;
    }

    if (
      !rule.applies_to_events.includes("any") &&
      !rule.applies_to_events.includes(eventType)
    ) {
      return false;
    }

    if (rule.require_room && !report.room_id) {
      return false;
    }

    if (rule.kind === "metadata_boolean_bonus") {
      if (!rule.metadata_key) {
        return false;
      }

      return report.metadata[rule.metadata_key] === rule.boolean_match;
    }

    if (rule.kind === "metadata_number_multiplier") {
      if (!rule.metadata_key) {
        return false;
      }

      return typeof report.metadata[rule.metadata_key] === "number";
    }

    return true;
  }
}

export function buildDefaultPointsRuleSet(
  airlineCode: string,
  gameId: string
): PointsRuleSet {
  return pointsRuleSetSchema.parse({
    airline_code: airlineCode,
    game_id: gameId,
    max_points_per_report: 500,
    rules: [
      {
        applies_to_events: ["completion", "result", "duration", "entry", "any"],
        enabled: true,
        id: "requested-points",
        kind: "requested_points_multiplier",
        label: "Requested points passthrough",
        multiplier: 1
      },
      {
        applies_to_events: ["duration"],
        enabled: false,
        id: "duration-minutes",
        kind: "metadata_number_multiplier",
        label: "Duration minutes bonus",
        max_points: 20,
        metadata_key: "duration_minutes",
        multiplier: 2
      },
      {
        applies_to_events: ["result"],
        boolean_match: true,
        enabled: false,
        id: "winner-bonus",
        kind: "metadata_boolean_bonus",
        label: "Winner bonus",
        metadata_key: "is_winner",
        points: 6
      },
      {
        applies_to_events: ["completion", "result"],
        enabled: false,
        id: "multiplayer-bonus",
        kind: "flat_bonus",
        label: "Multiplayer room bonus",
        points: 4,
        require_room: true
      },
      {
        applies_to_events: ["entry"],
        enabled: false,
        id: "entry-bonus",
        kind: "flat_bonus",
        label: "Entry bonus",
        points: 2
      }
    ],
    updated_at: new Date().toISOString()
  });
}

export function inferPointsEventType(report: PointsReportRecord): PointsEventType {
  const metadataEventType = report.metadata.event_type;
  if (
    metadataEventType === "entry" ||
    metadataEventType === "completion" ||
    metadataEventType === "duration" ||
    metadataEventType === "result"
  ) {
    return metadataEventType;
  }

  if (typeof report.metadata.duration_minutes === "number") {
    return "duration";
  }

  if (
    typeof report.metadata.is_winner === "boolean" ||
    Array.isArray(report.metadata.winning_player_ids)
  ) {
    return "result";
  }

  return "completion";
}

function evaluateRule(rule: PointsRule, report: PointsReportRecord) {
  const awardedPoints = resolveAwardedPoints(rule, report);
  const boundedPoints =
    rule.max_points === undefined
      ? awardedPoints
      : Math.min(awardedPoints, rule.max_points);

  return {
    awarded_points: boundedPoints,
    detail: formatRuleDetail(rule, report, boundedPoints),
    label: rule.label,
    rule_id: rule.id
  };
}

function resolveAwardedPoints(rule: PointsRule, report: PointsReportRecord) {
  switch (rule.kind) {
    case "requested_points_multiplier":
      return Math.round(report.points * (rule.multiplier ?? 1));
    case "metadata_number_multiplier": {
      const rawValue =
        typeof report.metadata[rule.metadata_key ?? ""] === "number"
          ? (report.metadata[rule.metadata_key ?? ""] as number)
          : 0;
      return Math.round(rawValue * (rule.multiplier ?? 1));
    }
    case "metadata_boolean_bonus":
      return rule.points ?? 0;
    case "flat_bonus":
      return rule.points ?? 0;
  }
}

function formatRuleDetail(
  rule: PointsRule,
  report: PointsReportRecord,
  awardedPoints: number
) {
  switch (rule.kind) {
    case "requested_points_multiplier":
      return `${report.points} requested x ${rule.multiplier ?? 1} = ${awardedPoints}`;
    case "metadata_number_multiplier": {
      const rawValue = report.metadata[rule.metadata_key ?? ""] ?? 0;
      return `${String(rawValue)} x ${rule.multiplier ?? 1} = ${awardedPoints}`;
    }
    case "metadata_boolean_bonus":
      return `${rule.metadata_key} matched -> ${awardedPoints}`;
    case "flat_bonus":
      return `Flat bonus ${awardedPoints}`;
  }
}

function parseAuditLimit(limitInput: string | undefined) {
  if (!limitInput) {
    return 20;
  }

  const limit = Number.parseInt(limitInput, 10);
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    throw new BadRequestException({
      limit: limitInput,
      message: "Invalid points audit limit"
    });
  }

  return limit;
}

function createPointsAuditId(reportId: string) {
  return `points-audit-${Buffer.from(reportId).toString("base64url")}`;
}
