import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type MemoryMatchCard = {
  id: string;
  label: string;
  pairId: string;
  status: "hidden" | "revealed" | "matched";
};

export type MemoryMatchRecentMove = {
  cardId: string;
  cardIndex: number;
  playerId: string;
  revealedAt: string;
  seq: number;
};

export type MemoryMatchResolvedTurn = {
  cards: string[];
  completedAt: string;
  matched: boolean;
  playerId: string;
  roundNumber: number;
  scoresSnapshot: Record<string, number>;
};

export type MemoryMatchRoomState = {
  board: MemoryMatchCard[];
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastResolvedTurn: MemoryMatchResolvedTurn | null;
  lastSeqByPlayer: Record<string, number>;
  matchedPairCount: number;
  players: string[];
  recentMoves: MemoryMatchRecentMove[];
  revision: number;
  roundNumber: number;
  scores: Record<string, number>;
  selection: number[];
  selectionOwnerPlayerId: string | null;
  totalPairs: number;
  updatedAt: string;
};

export abstract class MemoryMatchDuelStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<MemoryMatchRoomState | undefined>;
  abstract set(
    roomId: string,
    state: MemoryMatchRoomState
  ): Promise<MemoryMatchRoomState>;
}

const MEMORY_MATCH_STATE_KEY_PREFIX = "wifi-portal:game-state:memory-match-duel:";
const MEMORY_MATCH_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreMemoryMatchDuelStateRepository extends MemoryMatchDuelStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<MemoryMatchRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: MemoryMatchRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: MEMORY_MATCH_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${MEMORY_MATCH_STATE_KEY_PREFIX}${roomId}`;
  }
}
