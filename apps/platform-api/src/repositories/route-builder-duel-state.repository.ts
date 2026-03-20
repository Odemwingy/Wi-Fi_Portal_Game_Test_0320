import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type RouteLane = "central" | "coastal" | "northern";

export type RouteBuilderLeg = {
  baseScore: number;
  fromLabel: string;
  lane: RouteLane;
  legId: string;
  ownerPlayerId: string | null;
  toLabel: string;
};

export type RouteBuilderMove = {
  comboBonus: number;
  lane: RouteLane;
  legId: string;
  playerId: string;
  pointsAwarded: number;
  selectedAt: string;
  seq: number;
};

export type RouteBuilderRoomState = {
  availableLegCount: number;
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastMove: RouteBuilderMove | null;
  lastSeqByPlayer: Record<string, number>;
  legs: RouteBuilderLeg[];
  moves: RouteBuilderMove[];
  playerMarks: Record<string, "C" | "F">;
  players: string[];
  revision: number;
  scores: Record<string, number>;
  updatedAt: string;
  winnerPlayerIds: string[];
};

export abstract class RouteBuilderDuelStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<RouteBuilderRoomState | undefined>;
  abstract set(
    roomId: string,
    state: RouteBuilderRoomState
  ): Promise<RouteBuilderRoomState>;
}

const ROUTE_BUILDER_STATE_KEY_PREFIX =
  "wifi-portal:game-state:route-builder-duel:";
const ROUTE_BUILDER_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreRouteBuilderDuelStateRepository extends RouteBuilderDuelStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<RouteBuilderRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: RouteBuilderRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: ROUTE_BUILDER_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${ROUTE_BUILDER_STATE_KEY_PREFIX}${roomId}`;
  }
}
