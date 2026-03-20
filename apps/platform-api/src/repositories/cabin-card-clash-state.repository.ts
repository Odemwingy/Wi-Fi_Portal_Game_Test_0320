import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type CabinCardAccent = "amber" | "mint" | "rose" | "sea";
export type CabinCardSuit = "beverage" | "comfort" | "meal" | "upgrade";

export type CabinCard = {
  accent: CabinCardAccent;
  id: string;
  label: string;
  power: number;
  suit: CabinCardSuit;
};

export type CabinCardPlay = {
  cardId: string;
  playedAt: string;
  playerId: string;
  power: number;
  roundNumber: number;
  seq: number;
  suit: CabinCardSuit;
};

export type CabinCardRoundResult = {
  awardedPoints: Record<string, number>;
  cardsByPlayer: Record<string, CabinCardPlay>;
  roundNumber: number;
  winnerPlayerIds: string[];
};

export type CabinCardClashRoomState = {
  currentRoundCards: Record<string, CabinCardPlay>;
  currentRoundNumber: number;
  currentTurnPlayerId: string;
  handsByPlayer: Record<string, CabinCard[]>;
  isCompleted: boolean;
  lastRoundResult: CabinCardRoundResult | null;
  lastSeqByPlayer: Record<string, number>;
  players: string[];
  playedCardIdsByPlayer: Record<string, string[]>;
  revision: number;
  roundResults: CabinCardRoundResult[];
  scores: Record<string, number>;
  totalRounds: number;
  updatedAt: string;
  winnerPlayerIds: string[];
};

export abstract class CabinCardClashStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<CabinCardClashRoomState | undefined>;
  abstract set(
    roomId: string,
    state: CabinCardClashRoomState
  ): Promise<CabinCardClashRoomState>;
}

const CABIN_CARD_CLASH_STATE_KEY_PREFIX = "wifi-portal:game-state:cabin-card-clash:";
const CABIN_CARD_CLASH_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreCabinCardClashStateRepository extends CabinCardClashStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<CabinCardClashRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: CabinCardClashRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: CABIN_CARD_CLASH_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${CABIN_CARD_CLASH_STATE_KEY_PREFIX}${roomId}`;
  }
}
