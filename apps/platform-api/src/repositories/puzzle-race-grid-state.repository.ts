import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type PuzzleGridCellTone = "amber" | "mint" | "rose" | "sea";

export type PuzzleGridCell = {
  cellId: string;
  col: number;
  ownerPlayerId: string | null;
  row: number;
  targetIndex: number;
  tone: PuzzleGridCellTone;
  value: number;
};

export type PuzzleGridMove = {
  cellId: string;
  playerId: string;
  pointsAwarded: number;
  progressAfter: number;
  seq: number;
  selectedAt: string;
  status: "accepted" | "ignored";
};

export type PuzzleRaceGridRoomState = {
  cells: PuzzleGridCell[];
  completedAtByPlayer: Record<string, string | null>;
  currentLeaderPlayerId: string | null;
  isCompleted: boolean;
  lastMove: PuzzleGridMove | null;
  lastSeqByPlayer: Record<string, number>;
  players: string[];
  progressByPlayer: Record<string, number>;
  revision: number;
  scores: Record<string, number>;
  targetCellIds: string[];
  updatedAt: string;
  winnerPlayerIds: string[];
};

export abstract class PuzzleRaceGridStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<PuzzleRaceGridRoomState | undefined>;
  abstract set(
    roomId: string,
    state: PuzzleRaceGridRoomState
  ): Promise<PuzzleRaceGridRoomState>;
}

const PUZZLE_RACE_GRID_STATE_KEY_PREFIX =
  "wifi-portal:game-state:puzzle-race-grid:";
const PUZZLE_RACE_GRID_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStorePuzzleRaceGridStateRepository extends PuzzleRaceGridStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<PuzzleRaceGridRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: PuzzleRaceGridRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: PUZZLE_RACE_GRID_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${PUZZLE_RACE_GRID_STATE_KEY_PREFIX}${roomId}`;
  }
}
