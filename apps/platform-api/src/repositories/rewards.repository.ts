import { Inject, Injectable } from "@nestjs/common";

import {
  rewardRedemptionRecordSchema,
  type RewardRedemptionRecord
} from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

type StoredPassengerRewardsLedger = {
  airline_code: string;
  passenger_id: string;
  processed_redemption_ids: string[];
  redeemed_points: number;
  redemption_history: RewardRedemptionRecord[];
  updated_at: string;
};

export abstract class RewardsRepository {
  abstract get(
    passengerId: string
  ): Promise<StoredPassengerRewardsLedger | undefined>;
  abstract set(
    passengerId: string,
    ledger: StoredPassengerRewardsLedger
  ): Promise<StoredPassengerRewardsLedger>;
}

const PASSENGER_REWARDS_KEY_PREFIX = "wifi-portal:rewards:passenger:";
const PASSENGER_REWARDS_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreRewardsRepository extends RewardsRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async get(passengerId: string) {
    const payload = await this.stateStore.get<StoredPassengerRewardsLedger>(
      this.toStorageKey(passengerId)
    );

    if (!payload) {
      return undefined;
    }

    return sanitizeRewardsLedger(payload);
  }

  async set(passengerId: string, ledger: StoredPassengerRewardsLedger) {
    return this.stateStore.set(this.toStorageKey(passengerId), ledger, {
      ttl_seconds: PASSENGER_REWARDS_TTL_SECONDS
    });
  }

  private toStorageKey(passengerId: string) {
    return `${PASSENGER_REWARDS_KEY_PREFIX}${passengerId}`;
  }
}

export function buildEmptyPassengerRewardsLedger(
  passengerId: string,
  airlineCode: string
): StoredPassengerRewardsLedger {
  return {
    airline_code: airlineCode,
    passenger_id: passengerId,
    processed_redemption_ids: [],
    redeemed_points: 0,
    redemption_history: [],
    updated_at: new Date().toISOString()
  };
}

export function appendRedemption(
  ledger: StoredPassengerRewardsLedger,
  record: RewardRedemptionRecord
): StoredPassengerRewardsLedger {
  if (ledger.processed_redemption_ids.includes(record.redemption_id)) {
    return ledger;
  }

  return {
    ...ledger,
    airline_code: record.airline_code,
    processed_redemption_ids: [
      record.redemption_id,
      ...ledger.processed_redemption_ids
    ].slice(0, 50),
    redeemed_points: ledger.redeemed_points + record.points_cost,
    redemption_history: [record, ...ledger.redemption_history].slice(0, 10),
    updated_at: record.redeemed_at
  };
}

function sanitizeRewardsLedger(payload: StoredPassengerRewardsLedger) {
  return {
    airline_code: payload.airline_code,
    passenger_id: payload.passenger_id,
    processed_redemption_ids: Array.isArray(payload.processed_redemption_ids)
      ? payload.processed_redemption_ids.filter(
          (value): value is string => typeof value === "string"
        )
      : [],
    redeemed_points:
      typeof payload.redeemed_points === "number" ? payload.redeemed_points : 0,
    redemption_history: Array.isArray(payload.redemption_history)
      ? payload.redemption_history.map((entry) =>
          rewardRedemptionRecordSchema.parse(entry)
        )
      : [],
    updated_at:
      typeof payload.updated_at === "string"
        ? payload.updated_at
        : new Date().toISOString()
  };
}

export type { StoredPassengerRewardsLedger };
