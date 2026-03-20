import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type TapBeatLaneId = "left" | "center" | "right";

export type TapBeatCue = {
  accent: "amber" | "mint" | "rose";
  id: string;
  laneId: TapBeatLaneId;
  label: string;
  points: number;
};

export type TapBeatAction = {
  cueId: string | null;
  expectedLaneId: TapBeatLaneId | null;
  laneId: TapBeatLaneId;
  playerId: string;
  pointsAwarded: number;
  roundNumber: number;
  seq: number;
  status: "accepted" | "rejected";
  stepNumber: number;
  submittedAt: string;
};

export type TapBeatRoundResult = {
  completedAt: string;
  pattern: TapBeatCue[];
  roundNumber: number;
  roundScores: Record<string, number>;
  scoresSnapshot: Record<string, number>;
  winnerPlayerIds: string[];
};

export type TapBeatBattleRoomState = {
  completedRounds: TapBeatRoundResult[];
  currentPattern: TapBeatCue[];
  currentRoundNumber: number;
  isCompleted: boolean;
  lastAction: TapBeatAction | null;
  lastSeqByPlayer: Record<string, number>;
  players: string[];
  progressByPlayer: Record<string, number>;
  recentActions: TapBeatAction[];
  revision: number;
  roundScoresByPlayer: Record<string, number>;
  scores: Record<string, number>;
  totalRounds: number;
  updatedAt: string;
  winnerPlayerIds: string[];
};

export abstract class TapBeatBattleStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<TapBeatBattleRoomState | undefined>;
  abstract set(
    roomId: string,
    state: TapBeatBattleRoomState
  ): Promise<TapBeatBattleRoomState>;
}

const TAP_BEAT_BATTLE_STATE_KEY_PREFIX = "wifi-portal:game-state:tap-beat-battle:";
const TAP_BEAT_BATTLE_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreTapBeatBattleStateRepository extends TapBeatBattleStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<TapBeatBattleRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: TapBeatBattleRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: TAP_BEAT_BATTLE_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${TAP_BEAT_BATTLE_STATE_KEY_PREFIX}${roomId}`;
  }
}
