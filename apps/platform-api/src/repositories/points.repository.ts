import { Inject, Injectable } from "@nestjs/common";

import { passengerPointsSummarySchema, type PassengerPointsSummary, type PointsReportRecord } from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

type StoredPassengerPointsSummary = PassengerPointsSummary & {
  processed_report_ids: string[];
};

export abstract class PointsRepository {
  abstract get(passengerId: string): Promise<StoredPassengerPointsSummary | undefined>;
  abstract list(): Promise<StoredPassengerPointsSummary[]>;
  abstract set(
    passengerId: string,
    summary: StoredPassengerPointsSummary
  ): Promise<StoredPassengerPointsSummary>;
}

const PASSENGER_POINTS_KEY_PREFIX = "wifi-portal:points:passenger:";
const PASSENGER_POINTS_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStorePointsRepository extends PointsRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async get(passengerId: string) {
    const payload = await this.stateStore.get<StoredPassengerPointsSummary>(
      this.toStorageKey(passengerId)
    );

    if (!payload) {
      return undefined;
    }

    return {
      ...passengerPointsSummarySchema.parse(payload),
      processed_report_ids: Array.isArray(payload.processed_report_ids)
        ? payload.processed_report_ids.filter(
            (value): value is string => typeof value === "string"
          )
        : []
    };
  }

  async list() {
    const keys = await this.stateStore.list(PASSENGER_POINTS_KEY_PREFIX);
    const entries = await Promise.all(
      keys.map(async (key) => {
        const payload =
          await this.stateStore.get<StoredPassengerPointsSummary>(key);

        if (!payload) {
          return null;
        }

        return {
          ...passengerPointsSummarySchema.parse(payload),
          processed_report_ids: Array.isArray(payload.processed_report_ids)
            ? payload.processed_report_ids.filter(
                (value): value is string => typeof value === "string"
              )
            : []
        };
      })
    );

    return entries.filter(
      (entry): entry is StoredPassengerPointsSummary => entry !== null
    );
  }

  async set(passengerId: string, summary: StoredPassengerPointsSummary) {
    return this.stateStore.set(this.toStorageKey(passengerId), summary, {
      ttl_seconds: PASSENGER_POINTS_TTL_SECONDS
    });
  }

  private toStorageKey(passengerId: string) {
    return `${PASSENGER_POINTS_KEY_PREFIX}${passengerId}`;
  }
}

export function buildEmptyPassengerPointsSummary(
  passengerId: string
): StoredPassengerPointsSummary {
  const now = new Date().toISOString();

  return {
    by_game: {},
    latest_reports: [],
    passenger_id: passengerId,
    processed_report_ids: [],
    total_points: 0,
    updated_at: now
  };
}

export function appendPointsReport(
  summary: StoredPassengerPointsSummary,
  report: PointsReportRecord
): StoredPassengerPointsSummary {
  if (summary.processed_report_ids.includes(report.report_id)) {
    return summary;
  }

  const nextByGame = {
    ...summary.by_game,
    [report.game_id]: (summary.by_game[report.game_id] ?? 0) + report.points
  };

  return {
    ...summary,
    by_game: nextByGame,
    latest_reports: [report, ...summary.latest_reports].slice(0, 10),
    processed_report_ids: [report.report_id, ...summary.processed_report_ids].slice(0, 50),
    total_points: summary.total_points + report.points,
    updated_at: report.reported_at
  };
}
