import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type QuizChoice = "A" | "B" | "C" | "D";
export type QuizPromptOption = {
  description: string;
  id: QuizChoice;
  label: string;
};

export type QuizPrompt = {
  body: string;
  id: string;
  options: QuizPromptOption[];
  title: string;
};

export type QuizRoundResult = {
  answers: Array<{
    answer: QuizChoice;
    playerId: string;
    seq: number;
    submittedAt: string;
  }>;
  completedAt: string;
  correctAnswer: QuizChoice;
  prompt: QuizPrompt;
  roundNumber: number;
  scoresSnapshot: Record<string, number>;
  winningPlayerIds: string[];
};

export type QuizDuelRoomState = {
  answers: Array<{
    answer: QuizChoice;
    playerId: string;
    seq: number;
    submittedAt: string;
  }>;
  answersByPlayer: Record<string, QuizChoice | null>;
  completedRounds: QuizRoundResult[];
  correctAnswer: QuizChoice;
  currentRoundNumber: number;
  isCompleted: boolean;
  lastSeqByPlayer: Record<string, number>;
  players: string[];
  prompt: QuizPrompt;
  revision: number;
  scores: Record<string, number>;
  totalRounds: number;
  updatedAt: string;
};

export abstract class QuizDuelStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<QuizDuelRoomState | undefined>;
  abstract set(
    roomId: string,
    state: QuizDuelRoomState
  ): Promise<QuizDuelRoomState>;
}

const QUIZ_DUEL_STATE_KEY_PREFIX = "wifi-portal:game-state:quiz-duel:";
const QUIZ_DUEL_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreQuizDuelStateRepository extends QuizDuelStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<QuizDuelRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: QuizDuelRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: QUIZ_DUEL_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${QUIZ_DUEL_STATE_KEY_PREFIX}${roomId}`;
  }
}
