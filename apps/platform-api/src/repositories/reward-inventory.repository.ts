import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

type RewardInventoryRecord = {
  airline_code: string;
  redeemed_count: number;
  redemptions_by_session: Record<string, number>;
  reward_id: string;
  updated_at: string;
};

export abstract class RewardInventoryRepository {
  abstract get(
    airlineCode: string,
    rewardId: string
  ): Promise<RewardInventoryRecord | undefined>;
  abstract set(
    airlineCode: string,
    rewardId: string,
    record: RewardInventoryRecord
  ): Promise<RewardInventoryRecord>;
}

const REWARD_INVENTORY_KEY_PREFIX = "wifi-portal:rewards:inventory:";
const REWARD_INVENTORY_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreRewardInventoryRepository extends RewardInventoryRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async get(airlineCode: string, rewardId: string) {
    const payload = await this.stateStore.get<RewardInventoryRecord>(
      this.toStorageKey(airlineCode, rewardId)
    );

    if (!payload) {
      return undefined;
    }

    return sanitizeInventoryRecord(payload, airlineCode, rewardId);
  }

  async set(airlineCode: string, rewardId: string, record: RewardInventoryRecord) {
    return this.stateStore.set(this.toStorageKey(airlineCode, rewardId), record, {
      ttl_seconds: REWARD_INVENTORY_TTL_SECONDS
    });
  }

  private toStorageKey(airlineCode: string, rewardId: string) {
    return `${REWARD_INVENTORY_KEY_PREFIX}${airlineCode.toUpperCase()}:${rewardId}`;
  }
}

export function buildEmptyRewardInventoryRecord(
  airlineCode: string,
  rewardId: string
): RewardInventoryRecord {
  return {
    airline_code: airlineCode.toUpperCase(),
    redeemed_count: 0,
    redemptions_by_session: {},
    reward_id: rewardId,
    updated_at: new Date().toISOString()
  };
}

export function appendRewardInventoryUsage(
  record: RewardInventoryRecord,
  sessionId: string
): RewardInventoryRecord {
  return {
    ...record,
    redeemed_count: record.redeemed_count + 1,
    redemptions_by_session: {
      ...record.redemptions_by_session,
      [sessionId]: (record.redemptions_by_session[sessionId] ?? 0) + 1
    },
    updated_at: new Date().toISOString()
  };
}

function sanitizeInventoryRecord(
  payload: RewardInventoryRecord,
  airlineCode: string,
  rewardId: string
): RewardInventoryRecord {
  return {
    airline_code:
      typeof payload.airline_code === "string"
        ? payload.airline_code
        : airlineCode.toUpperCase(),
    redeemed_count:
      typeof payload.redeemed_count === "number" ? payload.redeemed_count : 0,
    redemptions_by_session:
      payload.redemptions_by_session &&
      typeof payload.redemptions_by_session === "object" &&
      !Array.isArray(payload.redemptions_by_session)
        ? Object.fromEntries(
            Object.entries(payload.redemptions_by_session).filter(
              (entry): entry is [string, number] =>
                typeof entry[0] === "string" && typeof entry[1] === "number"
            )
          )
        : {},
    reward_id: typeof payload.reward_id === "string" ? payload.reward_id : rewardId,
    updated_at:
      typeof payload.updated_at === "string"
        ? payload.updated_at
        : new Date().toISOString()
  };
}

export type { RewardInventoryRecord };
