import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type WordRallyOption = {
  description: string;
  id: string;
  label: string;
};

export type WordRallyPrompt = {
  body: string;
  category: string;
  id: string;
  options: WordRallyOption[];
  requiredLetter: string;
  title: string;
};

export type WordRallyRoundResult = {
  answers: Array<{
    answerId: string;
    playerId: string;
    seq: number;
    submittedAt: string;
  }>;
  completedAt: string;
  correctOptionId: string;
  prompt: WordRallyPrompt;
  roundNumber: number;
  scoresSnapshot: Record<string, number>;
  winningPlayerIds: string[];
};

export type WordRallyRoomState = {
  answers: Array<{
    answerId: string;
    playerId: string;
    seq: number;
    submittedAt: string;
  }>;
  answersByPlayer: Record<string, string | null>;
  completedRounds: WordRallyRoundResult[];
  correctOptionId: string;
  currentRoundNumber: number;
  isCompleted: boolean;
  lastSeqByPlayer: Record<string, number>;
  players: string[];
  prompt: WordRallyPrompt;
  revision: number;
  scores: Record<string, number>;
  totalRounds: number;
  updatedAt: string;
};

export abstract class WordRallyStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<WordRallyRoomState | undefined>;
  abstract set(
    roomId: string,
    state: WordRallyRoomState
  ): Promise<WordRallyRoomState>;
}

const WORD_RALLY_STATE_KEY_PREFIX = "wifi-portal:game-state:word-rally:";
const WORD_RALLY_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreWordRallyStateRepository extends WordRallyStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<WordRallyRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: WordRallyRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: WORD_RALLY_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${WORD_RALLY_STATE_KEY_PREFIX}${roomId}`;
  }
}
