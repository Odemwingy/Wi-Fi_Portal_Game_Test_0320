import {
  BadRequestException,
  Inject,
  Injectable,
  Optional
} from "@nestjs/common";

import {
  pointsLeaderboardEntrySchema,
  pointsLeaderboardResponseSchema,
  passengerPointsSummarySchema,
  pointsReportRequestSchema,
  pointsReportRecordSchema,
  pointsReportResponseSchema,
  type PointsLeaderboardResponse,
  type PassengerPointsSummary,
  type PointsReportRequest,
  type PointsReportResponse
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import {
  appendPointsReport,
  buildEmptyPassengerPointsSummary,
  PointsRepository
} from "./repositories/points.repository";
import { AirlinePointsService } from "./airline-points.service";
import { PointsRulesService } from "./points-rules.service";

const logger = createStructuredLogger("platform-api.points");

@Injectable()
export class PointsService {
  constructor(
    @Inject(PointsRepository)
    private readonly pointsRepository: PointsRepository,
    @Inject(PointsRulesService)
    private readonly pointsRulesService: PointsRulesService,
    @Optional()
    @Inject(AirlinePointsService)
    private readonly airlinePointsService?: AirlinePointsService
  ) {}

  async getPassengerSummary(
    traceContext: TraceContext,
    passengerId: string
  ): Promise<PassengerPointsSummary> {
    const span = startChildSpan(traceContext);
    const summary = await this.pointsRepository.get(passengerId);
    const response = passengerPointsSummarySchema.parse(
      summary ?? buildEmptyPassengerPointsSummary(passengerId)
    );

    logger.info("points.summary.loaded", span, {
      input_summary: passengerId,
      output_summary: `${response.total_points} points`,
      metadata: {
        by_game: response.by_game
      }
    });

    return response;
  }

  async getLeaderboard(
    traceContext: TraceContext,
    limitInput: string | undefined
  ): Promise<PointsLeaderboardResponse> {
    const span = startChildSpan(traceContext);
    const limit = this.parseLimit(limitInput);
    const summaries = await this.pointsRepository.list();
    const entries = summaries
      .sort((left, right) => {
        if (right.total_points !== left.total_points) {
          return right.total_points - left.total_points;
        }

        return right.updated_at.localeCompare(left.updated_at);
      })
      .slice(0, limit)
      .map((summary, index) =>
        pointsLeaderboardEntrySchema.parse({
          by_game: summary.by_game,
          latest_report: summary.latest_reports[0] ?? null,
          passenger_id: summary.passenger_id,
          rank: index + 1,
          total_points: summary.total_points,
          updated_at: summary.updated_at
        })
      );

    const response = pointsLeaderboardResponseSchema.parse({
      entries,
      generated_at: new Date().toISOString(),
      limit,
      trace_id: traceContext.trace_id
    });

    logger.info("points.leaderboard.loaded", span, {
      input_summary: JSON.stringify({
        limit
      }),
      output_summary: `${response.entries.length} leaderboard entries`,
      metadata: {
        top_passenger_id: response.entries[0]?.passenger_id ?? null
      }
    });

    return response;
  }

  async reportPoints(
    traceContext: TraceContext,
    payload: unknown
  ): Promise<PointsReportResponse> {
    const span = startChildSpan(traceContext);
    const parsedPayload = this.parsePayload(payload, span);
    const existingSummary =
      (await this.pointsRepository.get(parsedPayload.passenger_id)) ??
      buildEmptyPassengerPointsSummary(parsedPayload.passenger_id);

    const report = pointsReportRecordSchema.parse({
      airline_code: parsedPayload.airline_code ?? null,
      ...parsedPayload,
      metadata: parsedPayload.metadata ?? {},
      reported_at: new Date().toISOString(),
      room_id: parsedPayload.room_id ?? null
    });

    const evaluation = await this.pointsRulesService.evaluateReport(span, report);
    const awardedReport = pointsReportRecordSchema.parse({
      ...report,
      points: evaluation.awarded_points
    });
    const nextSummary = appendPointsReport(existingSummary, awardedReport);
    const storedSummary = await this.pointsRepository.set(
      parsedPayload.passenger_id,
      nextSummary
    );
    const airlineSync = await this.airlinePointsService?.syncReportedPoints(
      span,
      awardedReport
    );

    const response = pointsReportResponseSchema.parse({
      airline_sync: airlineSync ?? null,
      audit_entry: evaluation.audit_entry,
      summary: passengerPointsSummarySchema.parse(storedSummary),
      trace_id: traceContext.trace_id
    });

    logger.info("points.reported", span, {
      input_summary: JSON.stringify({
        game_id: parsedPayload.game_id,
        passenger_id: parsedPayload.passenger_id,
        points: evaluation.awarded_points,
        report_id: parsedPayload.report_id
      }),
      output_summary: `${response.summary.total_points} total points`,
      metadata: {
        applied_rule_ids: response.audit_entry.applied_rule_ids,
        airline_sync_status: response.airline_sync?.status ?? null,
        by_game: response.summary.by_game,
        deduplicated: existingSummary.processed_report_ids.includes(
          parsedPayload.report_id
        )
      }
    });

    return response;
  }

  private parsePayload(
    payload: unknown,
    traceContext: TraceContext
  ): PointsReportRequest {
    const parsed = pointsReportRequestSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn("points.report.invalid_payload", traceContext, {
      input_summary: JSON.stringify(payload ?? {}),
      error_detail: parsed.error.message,
      status: "error"
    });

    throw new BadRequestException({
      message: "Invalid points report payload",
      issues: parsed.error.flatten()
    });
  }

  private parseLimit(limitInput: string | undefined) {
    if (!limitInput) {
      return 8;
    }

    const limit = Number.parseInt(limitInput, 10);
    if (!Number.isFinite(limit) || limit < 1 || limit > 20) {
      throw new BadRequestException({
        message: "Invalid leaderboard limit",
        limit: limitInput
      });
    }

    return limit;
  }
}
