import { Inject, Injectable } from "@nestjs/common";

import {
  airlinePointsSyncRecordSchema,
  type AirlinePointsSyncRecord,
  type AirlinePointsSyncStatus
} from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

export abstract class AirlinePointsSyncRepository {
  abstract get(syncId: string): Promise<AirlinePointsSyncRecord | undefined>;
  abstract list(input?: {
    airline_code?: string;
    limit?: number;
    status?: AirlinePointsSyncStatus;
  }): Promise<AirlinePointsSyncRecord[]>;
  abstract set(
    record: AirlinePointsSyncRecord
  ): Promise<AirlinePointsSyncRecord>;
}

const AIRLINE_POINTS_SYNC_KEY_PREFIX = "wifi-portal:airline-points:sync:";
const AIRLINE_POINTS_SYNC_TTL_SECONDS = 60 * 60 * 24 * 7;

@Injectable()
export class StateStoreAirlinePointsSyncRepository
  extends AirlinePointsSyncRepository
{
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async get(syncId: string) {
    const payload = await this.stateStore.get<AirlinePointsSyncRecord>(
      this.toStorageKey(syncId)
    );

    if (!payload) {
      return undefined;
    }

    return airlinePointsSyncRecordSchema.parse(payload);
  }

  async list(input: {
    airline_code?: string;
    limit?: number;
    status?: AirlinePointsSyncStatus;
  } = {}) {
    const keys = await this.stateStore.list(AIRLINE_POINTS_SYNC_KEY_PREFIX);
    const entries = await Promise.all(
      keys.map(async (key) => {
        const payload =
          await this.stateStore.get<AirlinePointsSyncRecord>(key);

        if (!payload) {
          return null;
        }

        const parsed = airlinePointsSyncRecordSchema.parse(payload);
        if (
          input.airline_code &&
          parsed.airline_code !== input.airline_code
        ) {
          return null;
        }
        if (input.status && parsed.status !== input.status) {
          return null;
        }

        return parsed;
      })
    );

    return entries
      .filter((entry): entry is AirlinePointsSyncRecord => entry !== null)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .slice(0, input.limit ?? 20);
  }

  async set(record: AirlinePointsSyncRecord) {
    return this.stateStore.set(
      this.toStorageKey(record.sync_id),
      airlinePointsSyncRecordSchema.parse(record),
      {
        ttl_seconds: AIRLINE_POINTS_SYNC_TTL_SECONDS
      }
    );
  }

  private toStorageKey(syncId: string) {
    return `${AIRLINE_POINTS_SYNC_KEY_PREFIX}${syncId}`;
  }
}

export function createAirlinePointsSyncId(idempotencyKey: string) {
  return Buffer.from(idempotencyKey).toString("base64url");
}
