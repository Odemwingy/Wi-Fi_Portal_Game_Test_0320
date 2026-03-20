import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type RouteBuilderLegView = {
  baseScore: number;
  fromLabel: string;
  lane: "central" | "coastal" | "northern";
  legId: string;
  ownerPlayerId: string | null;
  toLabel: string;
};

export type RouteBuilderMoveView = {
  comboBonus: number;
  lane: "central" | "coastal" | "northern";
  legId: string;
  playerId: string;
  pointsAwarded: number;
  selectedAt: string;
  seq: number;
};

export type RouteBuilderDuelViewState = {
  availableLegCount: number;
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastMove: RouteBuilderMoveView | null;
  legs: RouteBuilderLegView[];
  moves: RouteBuilderMoveView[];
  playerMarks: Record<string, "C" | "F">;
  players: string[];
  scores: Record<string, number>;
  winnerPlayerIds: string[];
};

export function parseRouteBuilderDuelState(
  snapshot: GameStateSnapshot
): RouteBuilderDuelViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const legs = Array.isArray(state.legs)
    ? state.legs
        .map((leg) => {
          const candidate = leg as Record<string, unknown>;
          if (
            typeof candidate.baseScore !== "number" ||
            typeof candidate.fromLabel !== "string" ||
            typeof candidate.legId !== "string" ||
            typeof candidate.toLabel !== "string" ||
            (candidate.lane !== "central" &&
              candidate.lane !== "coastal" &&
              candidate.lane !== "northern")
          ) {
            return null;
          }

          return {
            baseScore: candidate.baseScore,
            fromLabel: candidate.fromLabel,
            lane: candidate.lane,
            legId: candidate.legId,
            ownerPlayerId:
              typeof candidate.ownerPlayerId === "string" ? candidate.ownerPlayerId : null,
            toLabel: candidate.toLabel
          } satisfies RouteBuilderLegView;
        })
        .filter((leg): leg is RouteBuilderLegView => leg !== null)
    : [];

  if (legs.length === 0) {
    return null;
  }

  return {
    availableLegCount: Number(state.available_leg_count ?? 0),
    currentTurnPlayerId: String(state.current_turn_player_id ?? ""),
    isCompleted: Boolean(state.is_completed),
    lastMove: parseMove(state.last_move),
    legs,
    moves: Array.isArray(state.moves)
      ? state.moves
          .map((move) => parseMove(move))
          .filter((move): move is RouteBuilderMoveView => move !== null)
      : [],
    playerMarks: Object.fromEntries(
      Object.entries((state.player_marks ?? {}) as Record<string, unknown>).flatMap(
        ([playerId, mark]) =>
          mark === "C" || mark === "F" ? [[playerId, mark]] : []
      )
    ),
    players: Array.isArray(state.players)
      ? state.players.filter((playerId): playerId is string => typeof playerId === "string")
      : [],
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseMove(value: unknown): RouteBuilderMoveView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.comboBonus !== "number" ||
    (candidate.lane !== "central" &&
      candidate.lane !== "coastal" &&
      candidate.lane !== "northern") ||
    typeof candidate.legId !== "string" ||
    typeof candidate.playerId !== "string" ||
    typeof candidate.pointsAwarded !== "number" ||
    typeof candidate.selectedAt !== "string" ||
    typeof candidate.seq !== "number"
  ) {
    return null;
  }

  return {
    comboBonus: candidate.comboBonus,
    lane: candidate.lane,
    legId: candidate.legId,
    playerId: candidate.playerId,
    pointsAwarded: candidate.pointsAwarded,
    selectedAt: candidate.selectedAt,
    seq: candidate.seq
  };
}
