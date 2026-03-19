import { Inject, Injectable } from "@nestjs/common";

import { pointsRuleSetSchema, type PointsRuleSet } from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

export abstract class PointsRuleConfigRepository {
  abstract get(
    airlineCode: string,
    gameId: string
  ): Promise<PointsRuleSet | undefined>;
  abstract set(config: PointsRuleSet): Promise<PointsRuleSet>;
}

const POINTS_RULE_CONFIG_KEY_PREFIX = "wifi-portal:points-rules:config:";

@Injectable()
export class StateStorePointsRuleConfigRepository
  extends PointsRuleConfigRepository
{
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async get(airlineCode: string, gameId: string) {
    const payload = await this.stateStore.get<PointsRuleSet>(
      this.toStorageKey(airlineCode, gameId)
    );

    if (!payload) {
      return undefined;
    }

    return pointsRuleSetSchema.parse(payload);
  }

  async set(config: PointsRuleSet) {
    return this.stateStore.set(
      this.toStorageKey(config.airline_code, config.game_id),
      pointsRuleSetSchema.parse(config)
    );
  }

  private toStorageKey(airlineCode: string, gameId: string) {
    return `${POINTS_RULE_CONFIG_KEY_PREFIX}${airlineCode}:${gameId}`;
  }
}
