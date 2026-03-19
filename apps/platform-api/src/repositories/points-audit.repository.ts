import { Inject, Injectable } from "@nestjs/common";

import { pointsAuditEntrySchema, type PointsAuditEntry } from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

export abstract class PointsAuditRepository {
  abstract append(entry: PointsAuditEntry): Promise<PointsAuditEntry>;
  abstract list(input?: {
    game_id?: string;
    limit?: number;
    passenger_id?: string;
  }): Promise<PointsAuditEntry[]>;
}

const POINTS_AUDIT_KEY_PREFIX = "wifi-portal:points:audit:";
const POINTS_AUDIT_TTL_SECONDS = 60 * 60 * 24 * 14;

@Injectable()
export class StateStorePointsAuditRepository extends PointsAuditRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async append(entry: PointsAuditEntry) {
    return this.stateStore.set(
      this.toStorageKey(entry.audit_id),
      pointsAuditEntrySchema.parse(entry),
      {
        ttl_seconds: POINTS_AUDIT_TTL_SECONDS
      }
    );
  }

  async list(input: {
    game_id?: string;
    limit?: number;
    passenger_id?: string;
  } = {}) {
    const keys = await this.stateStore.list(POINTS_AUDIT_KEY_PREFIX);
    const entries = await Promise.all(
      keys.map(async (key) => {
        const payload = await this.stateStore.get<PointsAuditEntry>(key);
        if (!payload) {
          return null;
        }

        const entry = pointsAuditEntrySchema.parse(payload);
        if (input.passenger_id && entry.passenger_id !== input.passenger_id) {
          return null;
        }
        if (input.game_id && entry.game_id !== input.game_id) {
          return null;
        }
        return entry;
      })
    );

    return entries
      .filter((entry): entry is PointsAuditEntry => entry !== null)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, input.limit ?? 20);
  }

  private toStorageKey(auditId: string) {
    return `${POINTS_AUDIT_KEY_PREFIX}${auditId}`;
  }
}
