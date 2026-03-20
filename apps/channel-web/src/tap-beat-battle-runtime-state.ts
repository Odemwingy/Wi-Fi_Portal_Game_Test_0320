import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type TapBeatLaneId = "left" | "center" | "right";

export type TapBeatCueView = {
  accent: "amber" | "mint" | "rose";
  id: string;
  laneId: TapBeatLaneId;
  label: string;
  points: number;
};

export type TapBeatActionView = {
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

export type TapBeatRoundResultView = {
  completedAt: string;
  pattern: TapBeatCueView[];
  roundNumber: number;
  roundScores: Record<string, number>;
  scoresSnapshot: Record<string, number>;
  winnerPlayerIds: string[];
};

export type TapBeatBattleViewState = {
  completedRoundCount: number;
  currentPattern: TapBeatCueView[];
  currentRoundNumber: number;
  isCompleted: boolean;
  lastAction: TapBeatActionView | null;
  lastCompletedRound: TapBeatRoundResultView | null;
  nextCueByPlayer: Record<string, TapBeatCueView | null>;
  players: string[];
  progressByPlayer: Record<string, number>;
  recentActions: TapBeatActionView[];
  roundHistory: TapBeatRoundResultView[];
  roundScoresByPlayer: Record<string, number>;
  scores: Record<string, number>;
  totalRounds: number;
  winnerPlayerIds: string[];
};

export function parseTapBeatBattleState(
  snapshot: GameStateSnapshot
): TapBeatBattleViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const currentPattern = parseCueList(state.current_pattern);

  if (currentPattern.length === 0) {
    return null;
  }

  return {
    completedRoundCount: Number(state.completed_round_count ?? 0),
    currentPattern,
    currentRoundNumber: Number(state.current_round_number ?? 1),
    isCompleted: Boolean(state.is_completed),
    lastAction: parseAction(state.last_action),
    lastCompletedRound: parseRoundResult(state.last_completed_round),
    nextCueByPlayer: Object.fromEntries(
      Object.entries((state.next_cue_by_player ?? {}) as Record<string, unknown>).map(
        ([playerId, cue]) => [playerId, parseCue(cue)]
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
    recentActions: Array.isArray(state.recent_actions)
      ? state.recent_actions
          .map((action) => parseAction(action))
          .filter((action): action is TapBeatActionView => action !== null)
      : [],
    roundHistory: Array.isArray(state.round_history)
      ? state.round_history
          .map((round) => parseRoundResult(round))
          .filter((round): round is TapBeatRoundResultView => round !== null)
      : [],
    roundScoresByPlayer: Object.fromEntries(
      Object.entries((state.round_scores_by_player ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    totalRounds: Number(state.total_rounds ?? 1),
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseCueList(value: unknown) {
  return Array.isArray(value)
    ? value.map((cue) => parseCue(cue)).filter((cue): cue is TapBeatCueView => cue !== null)
    : [];
}

function parseCue(value: unknown): TapBeatCueView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.label !== "string" ||
    typeof candidate.points !== "number" ||
    (candidate.laneId !== "left" &&
      candidate.laneId !== "center" &&
      candidate.laneId !== "right") ||
    (candidate.accent !== "amber" &&
      candidate.accent !== "mint" &&
      candidate.accent !== "rose")
  ) {
    return null;
  }

  return {
    accent: candidate.accent,
    id: candidate.id,
    laneId: candidate.laneId,
    label: candidate.label,
    points: candidate.points
  };
}

function parseAction(value: unknown): TapBeatActionView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.playerId !== "string" ||
    typeof candidate.pointsAwarded !== "number" ||
    typeof candidate.roundNumber !== "number" ||
    typeof candidate.seq !== "number" ||
    typeof candidate.stepNumber !== "number" ||
    typeof candidate.submittedAt !== "string" ||
    (candidate.status !== "accepted" && candidate.status !== "rejected") ||
    (candidate.laneId !== "left" &&
      candidate.laneId !== "center" &&
      candidate.laneId !== "right")
  ) {
    return null;
  }

  return {
    cueId: typeof candidate.cueId === "string" ? candidate.cueId : null,
    expectedLaneId:
      candidate.expectedLaneId === "left" ||
      candidate.expectedLaneId === "center" ||
      candidate.expectedLaneId === "right"
        ? candidate.expectedLaneId
        : null,
    laneId: candidate.laneId,
    playerId: candidate.playerId,
    pointsAwarded: candidate.pointsAwarded,
    roundNumber: candidate.roundNumber,
    seq: candidate.seq,
    status: candidate.status,
    stepNumber: candidate.stepNumber,
    submittedAt: candidate.submittedAt
  };
}

function parseRoundResult(value: unknown): TapBeatRoundResultView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.completedAt !== "string" ||
    typeof candidate.roundNumber !== "number"
  ) {
    return null;
  }

  return {
    completedAt: candidate.completedAt,
    pattern: parseCueList(candidate.pattern),
    roundNumber: candidate.roundNumber,
    roundScores: Object.fromEntries(
      Object.entries((candidate.roundScores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    scoresSnapshot: Object.fromEntries(
      Object.entries((candidate.scoresSnapshot ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    winnerPlayerIds: Array.isArray(candidate.winnerPlayerIds)
      ? candidate.winnerPlayerIds.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}
