import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  airlinePointsConfigSchema,
  airlinePointsConfigUpsertRequestSchema,
  airlinePointsDispatchPendingRequestSchema,
  airlinePointsDispatchPendingResponseSchema,
  airlinePointsSyncListResponseSchema,
  airlinePointsSyncRecordSchema,
  pointsAirlineSyncSummarySchema,
  type AirlinePointsConfig,
  type AirlinePointsConfigUpsertRequest,
  type AirlinePointsDispatchPendingResponse,
  type AirlinePointsSyncRecord,
  type PointsAirlineSyncSummary,
  type PointsReportRecord
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import {
  AirlinePointsAdapter,
  LegacyBatchAirlinePointsAdapter,
  MockHttpAirlinePointsAdapter,
  PermanentAirlinePointsSyncError,
  RetryableAirlinePointsSyncError
} from "./airline-points.adapter";
import { AirlinePointsConfigRepository } from "./repositories/airline-points-config.repository";
import {
  AirlinePointsSyncRepository,
  createAirlinePointsSyncId
} from "./repositories/airline-points-sync.repository";

const logger = createStructuredLogger("platform-api.airline-points");

type DispatchReason = "batch_retry" | "manual_retry" | "realtime";

@Injectable()
export class AirlinePointsService {
  private readonly adapters: AirlinePointsAdapter[];

  constructor(
    @Inject(AirlinePointsConfigRepository)
    private readonly configRepository: AirlinePointsConfigRepository,
    @Inject(AirlinePointsSyncRepository)
    private readonly syncRepository: AirlinePointsSyncRepository,
    @Inject(MockHttpAirlinePointsAdapter)
    mockHttpAdapter: MockHttpAirlinePointsAdapter,
    @Inject(LegacyBatchAirlinePointsAdapter)
    legacyBatchAdapter: LegacyBatchAirlinePointsAdapter
  ) {
    this.adapters = [mockHttpAdapter, legacyBatchAdapter];
  }

  async getConfig(traceContext: TraceContext, airlineCode: string) {
    const span = startChildSpan(traceContext);
    const config = await this.getEffectiveConfig(airlineCode);

    logger.info("airline-points.config.loaded", span, {
      input_summary: airlineCode,
      output_summary: `${config.provider}/${config.sync_mode}`,
      metadata: {
        enabled: config.enabled
      }
    });

    return config;
  }

  async updateConfig(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const parsed = this.parseConfigPayload(payload, span);
    const config = airlinePointsConfigSchema.parse({
      ...parsed,
      updated_at: new Date().toISOString()
    });
    const saved = await this.configRepository.set(config);

    logger.info("airline-points.config.updated", span, {
      input_summary: saved.airline_code,
      output_summary: `${saved.provider}/${saved.sync_mode}`,
      metadata: {
        enabled: saved.enabled,
        retry_policy: saved.retry_policy
      }
    });

    return saved;
  }

  async syncReportedPoints(
    traceContext: TraceContext,
    report: PointsReportRecord
  ): Promise<PointsAirlineSyncSummary | null> {
    const airlineCode = report.airline_code;
    if (!airlineCode) {
      return null;
    }

    const config = await this.getEffectiveConfig(airlineCode);
    if (!config.enabled) {
      return null;
    }

    const idempotencyKey = buildAirlinePointsIdempotencyKey(report);
    const syncId = createAirlinePointsSyncId(idempotencyKey);
    const existingRecord = await this.syncRepository.get(syncId);

    if (existingRecord) {
      return this.toSyncSummary(existingRecord);
    }

    const now = new Date().toISOString();
    const pendingRecord = airlinePointsSyncRecordSchema.parse({
      airline_code: airlineCode,
      attempt_count: 0,
      converted_points: Math.round(report.points * config.points_multiplier),
      created_at: now,
      external_reference: null,
      game_id: report.game_id,
      idempotency_key: idempotencyKey,
      last_attempt_at: null,
      last_error: null,
      max_attempts: config.retry_policy.max_attempts,
      next_retry_at: null,
      passenger_id: report.passenger_id,
      payload_preview: this.buildPayloadPreview(config, report, idempotencyKey),
      points: report.points,
      provider: config.provider,
      report_id: report.report_id,
      room_id: report.room_id,
      session_id: report.session_id,
      status: "pending",
      sync_id: syncId,
      sync_mode: config.sync_mode,
      synced_at: null,
      updated_at: now
    });

    await this.syncRepository.set(pendingRecord);

    const record =
      config.sync_mode === "realtime"
        ? await this.dispatchRecord(traceContext, syncId, "realtime")
        : pendingRecord;

    return this.toSyncSummary(record);
  }

  async listSyncRecords(
    traceContext: TraceContext,
    input: {
      airline_code?: string;
      limit?: string;
      status?: string;
    }
  ) {
    const span = startChildSpan(traceContext);
    const limit = this.parseLimit(input.limit);
    const status = this.parseStatus(input.status);
    const entries = await this.syncRepository.list({
      airline_code: input.airline_code,
      limit,
      status
    });

    logger.info("airline-points.sync-records.loaded", span, {
      input_summary: JSON.stringify({
        airline_code: input.airline_code ?? null,
        limit,
        status: status ?? null
      }),
      output_summary: `${entries.length} sync records`
    });

    return airlinePointsSyncListResponseSchema.parse({
      entries,
      trace_id: traceContext.trace_id
    });
  }

  async retrySync(traceContext: TraceContext, syncId: string) {
    const record = await this.dispatchRecord(traceContext, syncId, "manual_retry");
    return this.toSyncSummary(record);
  }

  async dispatchPending(
    traceContext: TraceContext,
    payload: unknown
  ): Promise<AirlinePointsDispatchPendingResponse> {
    const span = startChildSpan(traceContext);
    const parsed = airlinePointsDispatchPendingRequestSchema.parse(payload ?? {});
    const entries = await this.syncRepository.list({
      airline_code: parsed.airline_code,
      limit: parsed.limit ?? 20
    });

    const now = Date.now();
    const eligible = entries.filter((entry) => {
      if (entry.status === "synced") {
        return false;
      }

      if (entry.sync_mode === "batch") {
        return true;
      }

      if (!entry.next_retry_at) {
        return false;
      }

      return Date.parse(entry.next_retry_at) <= now;
    });

    const processed: AirlinePointsSyncRecord[] = [];
    for (const entry of eligible) {
      processed.push(
        await this.dispatchRecord(traceContext, entry.sync_id, "batch_retry")
      );
    }

    logger.info("airline-points.pending.dispatched", span, {
      input_summary: JSON.stringify(parsed),
      output_summary: `${processed.length} records processed`
    });

    return airlinePointsDispatchPendingResponseSchema.parse({
      entries: processed,
      processed_count: processed.length,
      trace_id: traceContext.trace_id
    });
  }

  private async dispatchRecord(
    traceContext: TraceContext,
    syncId: string,
    reason: DispatchReason
  ) {
    const span = startChildSpan(traceContext);
    const existingRecord = await this.syncRepository.get(syncId);
    if (!existingRecord) {
      throw new NotFoundException(`Unknown airline sync id ${syncId}`);
    }

    if (existingRecord.status === "synced") {
      return existingRecord;
    }

    const config = await this.getEffectiveConfig(existingRecord.airline_code);
    const adapter = this.resolveAdapter(config.provider);
    const attemptCount = existingRecord.attempt_count + 1;
    const now = new Date().toISOString();

    try {
      const result = await adapter.sync({
        config,
        record: existingRecord
      });

      const syncedRecord = airlinePointsSyncRecordSchema.parse({
        ...existingRecord,
        attempt_count: attemptCount,
        external_reference: result.external_reference,
        last_attempt_at: now,
        last_error: null,
        next_retry_at: null,
        payload_preview: this.buildPayloadPreviewFromRecord(
          config,
          existingRecord
        ),
        status: "synced",
        synced_at: now,
        updated_at: now
      });

      logger.info("airline-points.sync.succeeded", span, {
        input_summary: syncId,
        output_summary: result.external_reference,
        metadata: {
          airline_code: syncedRecord.airline_code,
          attempt_count: syncedRecord.attempt_count,
          reason
        }
      });

      return this.syncRepository.set(syncedRecord);
    } catch (error) {
      const retryable = error instanceof RetryableAirlinePointsSyncError;
      const nextRetryAt =
        retryable && attemptCount < config.retry_policy.max_attempts
          ? new Date(
              Date.now() +
                config.retry_policy.base_backoff_seconds * attemptCount * 1000
            ).toISOString()
          : null;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown airline sync error";
      const failedRecord = airlinePointsSyncRecordSchema.parse({
        ...existingRecord,
        attempt_count: attemptCount,
        last_attempt_at: now,
        last_error: errorMessage,
        next_retry_at: nextRetryAt,
        payload_preview: this.buildPayloadPreviewFromRecord(
          config,
          existingRecord
        ),
        status: "failed",
        synced_at: null,
        updated_at: now
      });

      logger.warn("airline-points.sync.failed", span, {
        input_summary: syncId,
        error_detail: errorMessage,
        metadata: {
          airline_code: failedRecord.airline_code,
          attempt_count: failedRecord.attempt_count,
          permanent: error instanceof PermanentAirlinePointsSyncError,
          reason
        },
        status: "error"
      });

      return this.syncRepository.set(failedRecord);
    }
  }

  private buildPayloadPreview(
    config: AirlinePointsConfig,
    report: PointsReportRecord,
    idempotencyKey: string
  ) {
    const source = {
      airline_code: report.airline_code,
      game_id: report.game_id,
      passenger_id: report.passenger_id,
      points: report.points,
      reason: report.reason,
      report_id: report.report_id,
      room_id: report.room_id,
      session_id: report.session_id
    };

    const mapped = Object.fromEntries(
      Object.entries(config.field_mapping).map(([target, sourceKey]) => [
        target,
        source[sourceKey as keyof typeof source] ?? null
      ])
    );

    return {
      ...mapped,
      idempotency_key: idempotencyKey,
      miles_awarded: Math.round(report.points * config.points_multiplier)
    };
  }

  private buildPayloadPreviewFromRecord(
    config: AirlinePointsConfig,
    record: AirlinePointsSyncRecord
  ) {
    return this.buildPayloadPreview(
      config,
      {
        airline_code: record.airline_code,
        game_id: record.game_id,
        metadata: {},
        passenger_id: record.passenger_id,
        points: record.points,
        reason: "stored-sync-record",
        report_id: record.report_id,
        reported_at: record.created_at,
        room_id: record.room_id,
        session_id: record.session_id
      },
      record.idempotency_key
    );
  }

  private async getEffectiveConfig(airlineCode: string) {
    const stored = await this.configRepository.get(airlineCode);
    if (stored) {
      return stored;
    }

    return buildDefaultAirlinePointsConfig(airlineCode);
  }

  private parseConfigPayload(
    payload: unknown,
    traceContext: TraceContext
  ): AirlinePointsConfigUpsertRequest {
    const parsed = airlinePointsConfigUpsertRequestSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn("airline-points.config.invalid_payload", traceContext, {
      input_summary: JSON.stringify(payload ?? {}),
      error_detail: parsed.error.message,
      status: "error"
    });

    throw new BadRequestException({
      message: "Invalid airline points config payload",
      issues: parsed.error.flatten()
    });
  }

  private parseLimit(limitInput: string | undefined) {
    if (!limitInput) {
      return 20;
    }

    const limit = Number.parseInt(limitInput, 10);
    if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException({
        limit: limitInput,
        message: "Invalid airline sync list limit"
      });
    }

    return limit;
  }

  private parseStatus(statusInput: string | undefined) {
    if (!statusInput) {
      return undefined;
    }

    if (
      statusInput === "pending" ||
      statusInput === "synced" ||
      statusInput === "failed"
    ) {
      return statusInput;
    }

    throw new BadRequestException({
      message: "Invalid airline sync status",
      status: statusInput
    });
  }

  private resolveAdapter(provider: AirlinePointsConfig["provider"]) {
    const adapter = this.adapters.find((entry) => entry.supports(provider));
    if (!adapter) {
      throw new BadRequestException(`Unsupported airline points provider ${provider}`);
    }

    return adapter;
  }

  private toSyncSummary(record: AirlinePointsSyncRecord) {
    return pointsAirlineSyncSummarySchema.parse({
      airline_code: record.airline_code,
      attempt_count: record.attempt_count,
      external_reference: record.external_reference,
      idempotency_key: record.idempotency_key,
      last_error: record.last_error,
      next_retry_at: record.next_retry_at,
      status: record.status,
      sync_id: record.sync_id,
      sync_mode: record.sync_mode,
      synced_at: record.synced_at,
      updated_at: record.updated_at
    });
  }
}

export function buildAirlinePointsIdempotencyKey(report: {
  airline_code: string | null;
  passenger_id: string;
  report_id: string;
  session_id: string;
}) {
  return [
    report.airline_code ?? "no-airline",
    report.session_id,
    report.passenger_id,
    report.report_id
  ].join(":");
}

export function buildDefaultAirlinePointsConfig(
  airlineCode: string
): AirlinePointsConfig {
  return airlinePointsConfigSchema.parse({
    airline_code: airlineCode.toUpperCase(),
    api_base_url: "https://demo-airline.invalid/points",
    auth_credential: "demo-token",
    auth_type: "bearer",
    enabled: true,
    field_mapping: {
      activity_code: "game_id",
      member_id: "passenger_id",
      request_id: "report_id",
      session_ref: "session_id"
    },
    points_multiplier: 1,
    provider: "mock-http",
    retry_policy: {
      base_backoff_seconds: 30,
      max_attempts: 3
    },
    simulation_mode: "success",
    sync_mode: "realtime",
    updated_at: new Date().toISOString()
  });
}
