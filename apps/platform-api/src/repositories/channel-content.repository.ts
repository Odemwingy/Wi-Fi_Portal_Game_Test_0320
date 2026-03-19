import { Inject, Injectable } from "@nestjs/common";

import type { ChannelContentState } from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

const CHANNEL_CONTENT_KEY_PREFIX = "wifi-portal:channel-content:";
const CHANNEL_CONTENT_TTL_SECONDS = 60 * 60 * 24 * 30;

export abstract class ChannelContentRepository {
  abstract get(
    airlineCode: string,
    locale: string
  ): Promise<ChannelContentState | undefined>;
  abstract set(
    airlineCode: string,
    locale: string,
    state: ChannelContentState
  ): Promise<ChannelContentState>;
}

@Injectable()
export class StateStoreChannelContentRepository extends ChannelContentRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async get(airlineCode: string, locale: string) {
    return this.stateStore.get<ChannelContentState>(
      this.toStorageKey(airlineCode, locale)
    );
  }

  async set(
    airlineCode: string,
    locale: string,
    state: ChannelContentState
  ) {
    return this.stateStore.set(this.toStorageKey(airlineCode, locale), state, {
      ttl_seconds: CHANNEL_CONTENT_TTL_SECONDS
    });
  }

  private toStorageKey(airlineCode: string, locale: string) {
    return `${CHANNEL_CONTENT_KEY_PREFIX}${airlineCode}:${locale}`;
  }
}
