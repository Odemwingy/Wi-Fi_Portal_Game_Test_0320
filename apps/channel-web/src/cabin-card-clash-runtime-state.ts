import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type CabinCardView = {
  accent: "amber" | "mint" | "rose" | "sea";
  id: string;
  label: string;
  power: number;
  suit: "beverage" | "comfort" | "meal" | "upgrade";
};

export type CabinCardPlayView = {
  cardId: string;
  playedAt: string;
  playerId: string;
  power: number;
  roundNumber: number;
  seq: number;
  suit: "beverage" | "comfort" | "meal" | "upgrade";
};

export type CabinCardRoundResultView = {
  awardedPoints: Record<string, number>;
  cardsByPlayer: Record<string, CabinCardPlayView>;
  roundNumber: number;
  winnerPlayerIds: string[];
};

export type CabinCardClashViewState = {
  currentRoundCards: Record<string, CabinCardPlayView>;
  currentRoundNumber: number;
  currentTurnPlayerId: string;
  handsByPlayer: Record<string, CabinCardView[]>;
  isCompleted: boolean;
  lastRoundResult: CabinCardRoundResultView | null;
  playedCardIdsByPlayer: Record<string, string[]>;
  players: string[];
  roundResults: CabinCardRoundResultView[];
  scores: Record<string, number>;
  totalRounds: number;
  winnerPlayerIds: string[];
};

export function parseCabinCardClashState(
  snapshot: GameStateSnapshot
): CabinCardClashViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const totalRounds = Number(state.total_rounds ?? 0);

  if (!Number.isFinite(totalRounds) || totalRounds <= 0) {
    return null;
  }

  return {
    currentRoundCards: Object.fromEntries(
      Object.entries((state.current_round_cards ?? {}) as Record<string, unknown>).flatMap(
        ([playerId, play]) => {
          const parsed = parsePlay(play);
          return parsed ? [[playerId, parsed]] : [];
        }
      )
    ),
    currentRoundNumber: Number(state.current_round_number ?? 1),
    currentTurnPlayerId: String(state.current_turn_player_id ?? ""),
    handsByPlayer: Object.fromEntries(
      Object.entries((state.hands_by_player ?? {}) as Record<string, unknown>).map(
        ([playerId, cards]) => [
          playerId,
          Array.isArray(cards)
            ? cards
                .map((card) => parseCard(card))
                .filter((card): card is CabinCardView => card !== null)
            : []
        ]
      )
    ),
    isCompleted: Boolean(state.is_completed),
    lastRoundResult: parseRoundResult(state.last_round_result),
    playedCardIdsByPlayer: Object.fromEntries(
      Object.entries((state.played_card_ids_by_player ?? {}) as Record<string, unknown>).map(
        ([playerId, cardIds]) => [
          playerId,
          Array.isArray(cardIds)
            ? cardIds.filter((cardId): cardId is string => typeof cardId === "string")
            : []
        ]
      )
    ),
    players: Array.isArray(state.players)
      ? state.players.filter((playerId): playerId is string => typeof playerId === "string")
      : [],
    roundResults: Array.isArray(state.round_results)
      ? state.round_results
          .map((result) => parseRoundResult(result))
          .filter((result): result is CabinCardRoundResultView => result !== null)
      : [],
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    totalRounds,
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseCard(value: unknown): CabinCardView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.label !== "string" ||
    typeof candidate.power !== "number" ||
    (candidate.accent !== "amber" &&
      candidate.accent !== "mint" &&
      candidate.accent !== "rose" &&
      candidate.accent !== "sea") ||
    (candidate.suit !== "beverage" &&
      candidate.suit !== "comfort" &&
      candidate.suit !== "meal" &&
      candidate.suit !== "upgrade")
  ) {
    return null;
  }

  return {
    accent: candidate.accent,
    id: candidate.id,
    label: candidate.label,
    power: candidate.power,
    suit: candidate.suit
  };
}

function parsePlay(value: unknown): CabinCardPlayView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.cardId !== "string" ||
    typeof candidate.playedAt !== "string" ||
    typeof candidate.playerId !== "string" ||
    typeof candidate.power !== "number" ||
    typeof candidate.roundNumber !== "number" ||
    typeof candidate.seq !== "number" ||
    (candidate.suit !== "beverage" &&
      candidate.suit !== "comfort" &&
      candidate.suit !== "meal" &&
      candidate.suit !== "upgrade")
  ) {
    return null;
  }

  return {
    cardId: candidate.cardId,
    playedAt: candidate.playedAt,
    playerId: candidate.playerId,
    power: candidate.power,
    roundNumber: candidate.roundNumber,
    seq: candidate.seq,
    suit: candidate.suit
  };
}

function parseRoundResult(value: unknown): CabinCardRoundResultView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.roundNumber !== "number") {
    return null;
  }

  return {
    awardedPoints: Object.fromEntries(
      Object.entries((candidate.awardedPoints ?? {}) as Record<string, unknown>).map(
        ([playerId, points]) => [playerId, Number(points ?? 0)]
      )
    ),
    cardsByPlayer: Object.fromEntries(
      Object.entries((candidate.cardsByPlayer ?? {}) as Record<string, unknown>).flatMap(
        ([playerId, play]) => {
          const parsed = parsePlay(play);
          return parsed ? [[playerId, parsed]] : [];
        }
      )
    ),
    roundNumber: candidate.roundNumber,
    winnerPlayerIds: Array.isArray(candidate.winnerPlayerIds)
      ? candidate.winnerPlayerIds.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}
