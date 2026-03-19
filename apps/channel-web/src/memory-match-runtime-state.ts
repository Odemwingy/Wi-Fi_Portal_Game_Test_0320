import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type MemoryMatchCardView = {
  id: string;
  label: string;
  pairId: string;
  status: "hidden" | "revealed" | "matched";
};

export type MemoryMatchResolvedTurnView = {
  cards: string[];
  completedAt: string;
  matched: boolean;
  playerId: string;
  roundNumber: number;
  scoresSnapshot: Record<string, number>;
};

export type MemoryMatchMoveView = {
  cardId: string;
  cardIndex: number;
  playerId: string;
  revealedAt: string;
  seq: number;
};

export type MemoryMatchViewState = {
  board: MemoryMatchCardView[];
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastResolvedTurn: MemoryMatchResolvedTurnView | null;
  matchedPairCount: number;
  players: string[];
  recentMoves: MemoryMatchMoveView[];
  roundNumber: number;
  scores: Record<string, number>;
  selection: number[];
  selectionOwnerPlayerId: string | null;
  totalPairs: number;
  winningPlayerIds: string[];
};

export function parseMemoryMatchState(
  snapshot: GameStateSnapshot
): MemoryMatchViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const board = Array.isArray(state.board)
    ? state.board
        .map((card) => {
          const candidate = card as Record<string, unknown>;
          if (
            typeof candidate.id !== "string" ||
            typeof candidate.label !== "string" ||
            typeof candidate.pairId !== "string"
          ) {
            return null;
          }

          const status =
            candidate.status === "revealed" || candidate.status === "matched"
              ? candidate.status
              : "hidden";

          return {
            id: candidate.id,
            label: candidate.label,
            pairId: candidate.pairId,
            status
          } satisfies MemoryMatchCardView;
        })
        .filter((value): value is MemoryMatchCardView => value !== null)
    : [];

  if (board.length === 0) {
    return null;
  }

  return {
    board,
    currentTurnPlayerId: String(state.current_turn_player_id ?? ""),
    isCompleted: Boolean(state.is_completed),
    lastResolvedTurn: parseResolvedTurn(state.last_resolved_turn),
    matchedPairCount: Number(state.matched_pair_count ?? 0),
    players: Array.isArray(state.players)
      ? state.players.filter((playerId): playerId is string => typeof playerId === "string")
      : [],
    recentMoves: Array.isArray(state.recent_moves)
      ? state.recent_moves
          .map((move) => {
            const candidate = move as Record<string, unknown>;
            if (
              typeof candidate.cardId !== "string" ||
              typeof candidate.cardIndex !== "number" ||
              typeof candidate.playerId !== "string" ||
              typeof candidate.revealedAt !== "string" ||
              typeof candidate.seq !== "number"
            ) {
              return null;
            }

            return {
              cardId: candidate.cardId,
              cardIndex: candidate.cardIndex,
              playerId: candidate.playerId,
              revealedAt: candidate.revealedAt,
              seq: candidate.seq
            } satisfies MemoryMatchMoveView;
          })
          .filter((value): value is MemoryMatchMoveView => value !== null)
      : [],
    roundNumber: Number(state.round_number ?? 1),
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    selection: Array.isArray(state.selection)
      ? state.selection.filter((value): value is number => typeof value === "number")
      : [],
    selectionOwnerPlayerId:
      typeof state.selection_owner_player_id === "string"
        ? state.selection_owner_player_id
        : null,
    totalPairs: Number(state.total_pairs ?? 0),
    winningPlayerIds: Array.isArray(state.winning_player_ids)
      ? state.winning_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseResolvedTurn(value: unknown): MemoryMatchResolvedTurnView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Record<string, unknown>;
  if (
    typeof entry.completedAt !== "string" ||
    typeof entry.matched !== "boolean" ||
    typeof entry.playerId !== "string" ||
    typeof entry.roundNumber !== "number"
  ) {
    return null;
  }

  return {
    cards: Array.isArray(entry.cards)
      ? entry.cards.filter((cardId): cardId is string => typeof cardId === "string")
      : [],
    completedAt: entry.completedAt,
    matched: entry.matched,
    playerId: entry.playerId,
    roundNumber: entry.roundNumber,
    scoresSnapshot: Object.fromEntries(
      Object.entries((entry.scoresSnapshot ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    )
  };
}
