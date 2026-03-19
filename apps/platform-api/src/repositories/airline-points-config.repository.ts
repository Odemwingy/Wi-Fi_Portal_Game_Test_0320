import { Inject, Injectable } from "@nestjs/common";

import {
  airlinePointsConfigSchema,
  type AirlinePointsConfig
} from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

export abstract class AirlinePointsConfigRepository {
  abstract get(airlineCode: string): Promise<AirlinePointsConfig | undefined>;
  abstract set(config: AirlinePointsConfig): Promise<AirlinePointsConfig>;
}

const AIRLINE_POINTS_CONFIG_KEY_PREFIX = "wifi-portal:airline-points:config:";

@Injectable()
export class StateStoreAirlinePointsConfigRepository
  extends AirlinePointsConfigRepository
{
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async get(airlineCode: string) {
    const payload = await this.stateStore.get<AirlinePointsConfig>(
      this.toStorageKey(airlineCode)
    );

    if (!payload) {
      return undefined;
    }

    return airlinePointsConfigSchema.parse(payload);
  }

  async set(config: AirlinePointsConfig) {
    return this.stateStore.set(
      this.toStorageKey(config.airline_code),
      airlinePointsConfigSchema.parse(config)
    );
  }

  private toStorageKey(airlineCode: string) {
    return `${AIRLINE_POINTS_CONFIG_KEY_PREFIX}${airlineCode}`;
  }
}
