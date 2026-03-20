import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type PuzzleGridCellView = {
  cellId: string;
  col: number;
  ownerPlayerId: string | null;
  row: number;
  targetIndex: number;
  tone: "amber" | "mint" | "rose" | "sea";
  value: number;
};

export type PuzzleGridMoveView = {
  cellId: string;
  playerId: string;
  pointsAwarded: number;
  progressAfter: number;
  seq: number;
  selectedAt: string;
  status: "accepted" | "ignored";
};

export type PuzzleRaceGridViewState = {
  cells: PuzzleGridCellView[];
  completedAtByPlayer: Record<string, string | null>;
  currentLeaderPlayerId: string | null;
  isCompleted: boolean;
  lastMove: PuzzleGridMoveView | null;
  nextTargetByPlayer: Record<string, string | null>;
  players: string[];
  progressByPlayer: Record<string, number>;
  scores: Record<string, number>;
  targetCellIds: string[];
  winnerPlayerIds: string[];
};

export function parsePuzzleRaceGridState(
  snapshot: GameStateSnapshot
): PuzzleRaceGridViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const cells = Array.isArray(state.cells)
    ? state.cells
        .map((cell) => {
          const candidate = cell as Record<string, unknown>;
          if (
            typeof candidate.cellId !== "string" ||
            typeof candidate.col !== "number" ||
            typeof candidate.row !== "number" ||
            typeof candidate.targetIndex !== "number" ||
            typeof candidate.value !== "number" ||
            (candidate.tone !== "amber" &&
              candidate.tone !== "mint" &&
              candidate.tone !== "rose" &&
              candidate.tone !== "sea")
          ) {
            return null;
          }

          return {
            cellId: candidate.cellId,
            col: candidate.col,
            ownerPlayerId:
              typeof candidate.ownerPlayerId === "string" ? candidate.ownerPlayerId : null,
            row: candidate.row,
            targetIndex: candidate.targetIndex,
            tone: candidate.tone,
            value: candidate.value
          } satisfies PuzzleGridCellView;
        })
        .filter((cell): cell is PuzzleGridCellView => cell !== null)
    : [];

  if (cells.length === 0) {
    return null;
  }

  return {
    cells,
    completedAtByPlayer: Object.fromEntries(
      Object.entries((state.completed_at_by_player ?? {}) as Record<string, unknown>).map(
        ([playerId, completedAt]) => [
          playerId,
          typeof completedAt === "string" ? completedAt : null
        ]
      )
    ),
    currentLeaderPlayerId:
      typeof state.current_leader_player_id === "string"
        ? state.current_leader_player_id
        : null,
    isCompleted: Boolean(state.is_completed),
    lastMove: parseMove(state.last_move),
    nextTargetByPlayer: Object.fromEntries(
      Object.entries((state.next_target_by_player ?? {}) as Record<string, unknown>).map(
        ([playerId, cellId]) => [playerId, typeof cellId === "string" ? cellId : null]
      )
    ),
    players: Array.isArray(state.players)
      ? state.players.filter((playerId): playerId is string => typeof playerId === "string")
      : [],
    progressByPlayer: Object.fromEntries(
      Object.entries((state.progress_by_player ?? {}) as Record<string, unknown>).map(
        ([playerId, progress]) => [playerId, Number(progress ?? 0)]
      )
    ),
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    targetCellIds: Array.isArray(state.target_cell_ids)
      ? state.target_cell_ids.filter((cellId): cellId is string => typeof cellId === "string")
      : [],
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseMove(value: unknown): PuzzleGridMoveView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.cellId !== "string" ||
    typeof candidate.playerId !== "string" ||
    typeof candidate.pointsAwarded !== "number" ||
    typeof candidate.progressAfter !== "number" ||
    typeof candidate.seq !== "number" ||
    typeof candidate.selectedAt !== "string" ||
    (candidate.status !== "accepted" && candidate.status !== "ignored")
  ) {
    return null;
  }

  return {
    cellId: candidate.cellId,
    playerId: candidate.playerId,
    pointsAwarded: candidate.pointsAwarded,
    progressAfter: candidate.progressAfter,
    seq: candidate.seq,
    selectedAt: candidate.selectedAt,
    status: candidate.status
  };
}
