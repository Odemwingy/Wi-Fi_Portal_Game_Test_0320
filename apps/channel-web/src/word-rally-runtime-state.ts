import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

type WordRallyOption = {
  description: string;
  id: string;
  label: string;
};

type WordRallyAnswer = {
  answerId: string;
  playerId: string;
  seq: number;
  submittedAt: string;
};

export type WordRallyRoundResult = {
  answersByPlayer: Record<string, string | null>;
  completedAt: string;
  correctOptionId: string;
  promptId: string;
  promptTitle: string;
  requiredLetter: string;
  roundNumber: number;
  scoresSnapshot: Record<string, number>;
  winningPlayerIds: string[];
};

export type WordRallyViewState = {
  allPlayersAnswered: boolean;
  answerCount: number;
  answersByPlayer: Record<string, string | null>;
  completedRoundCount: number;
  correctOptionId: string;
  currentRoundNumber: number;
  isCompleted: boolean;
  lastCompletedRound: WordRallyRoundResult | null;
  prompt: {
    body: string;
    category: string;
    id: string;
    options: WordRallyOption[];
    requiredLetter: string;
    title: string;
  };
  recentAnswers: WordRallyAnswer[];
  roundHistory: WordRallyRoundResult[];
  scores: Record<string, number>;
  totalRounds: number;
  winningPlayerIds: string[];
};

export function parseWordRallyState(snapshot: GameStateSnapshot): WordRallyViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const prompt = state.prompt as Record<string, unknown> | undefined;
  const options = Array.isArray(prompt?.options)
    ? prompt.options
        .map((option) => {
          const candidate = option as Record<string, unknown>;
          if (typeof candidate.id !== "string") {
            return null;
          }

          return {
            description: String(candidate.description ?? ""),
            id: candidate.id,
            label: String(candidate.label ?? candidate.id)
          };
        })
        .filter((value): value is WordRallyOption => value !== null)
    : [];

  if (
    typeof prompt?.title !== "string" ||
    typeof prompt.body !== "string" ||
    typeof prompt.id !== "string" ||
    typeof prompt.category !== "string" ||
    typeof prompt.requiredLetter !== "string" ||
    options.length === 0
  ) {
    return null;
  }

  const answersByPlayer = Object.fromEntries(
    Object.entries((state.answers_by_player ?? {}) as Record<string, unknown>).map(
      ([playerId, answer]) => [playerId, typeof answer === "string" ? answer : null]
    )
  ) as Record<string, string | null>;

  const recentAnswers = Array.isArray(state.recent_answers)
    ? state.recent_answers
        .map((entry) => {
          const answer = entry as Record<string, unknown>;
          if (
            typeof answer.answerId !== "string" ||
            typeof answer.playerId !== "string" ||
            typeof answer.seq !== "number" ||
            typeof answer.submittedAt !== "string"
          ) {
            return null;
          }

          return {
            answerId: answer.answerId,
            playerId: answer.playerId,
            seq: answer.seq,
            submittedAt: answer.submittedAt
          };
        })
        .filter((value): value is WordRallyAnswer => value !== null)
    : [];

  const roundHistory = Array.isArray(state.round_history)
    ? state.round_history
        .map(parseWordRallyRoundResult)
        .filter((value): value is WordRallyRoundResult => value !== null)
    : [];

  const lastCompletedRound = parseWordRallyRoundResult(state.last_completed_round);

  return {
    allPlayersAnswered: Boolean(state.all_players_answered),
    answerCount: Number(state.answer_count ?? 0),
    answersByPlayer,
    completedRoundCount: Number(state.completed_round_count ?? roundHistory.length),
    correctOptionId: String(state.correct_option_id ?? ""),
    currentRoundNumber: Number(state.current_round_number ?? 1),
    isCompleted: Boolean(state.is_completed),
    lastCompletedRound,
    prompt: {
      body: prompt.body,
      category: prompt.category,
      id: prompt.id,
      options,
      requiredLetter: prompt.requiredLetter,
      title: prompt.title
    },
    recentAnswers,
    roundHistory,
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    totalRounds: Number(state.total_rounds ?? 1),
    winningPlayerIds: Array.isArray(state.winning_player_ids)
      ? state.winning_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseWordRallyRoundResult(value: unknown): WordRallyRoundResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const prompt = entry.prompt as Record<string, unknown> | undefined;
  const answers = Array.isArray(entry.answers)
    ? entry.answers
        .map((answer) => {
          const candidate = answer as Record<string, unknown>;
          if (
            typeof candidate.answerId !== "string" ||
            typeof candidate.playerId !== "string"
          ) {
            return null;
          }

          return {
            answerId: candidate.answerId,
            playerId: candidate.playerId
          };
        })
        .filter(
          (
            answer
          ): answer is {
            answerId: string;
            playerId: string;
          } => answer !== null
        )
    : [];

  if (
    typeof entry.correctOptionId !== "string" ||
    typeof prompt?.id !== "string" ||
    typeof prompt.title !== "string" ||
    typeof prompt.requiredLetter !== "string" ||
    typeof entry.roundNumber !== "number" ||
    typeof entry.completedAt !== "string"
  ) {
    return null;
  }

  return {
    answersByPlayer: Object.fromEntries(
      answers.map((answer) => [answer.playerId, answer.answerId])
    ) as Record<string, string | null>,
    completedAt: entry.completedAt,
    correctOptionId: entry.correctOptionId,
    promptId: prompt.id,
    promptTitle: prompt.title,
    requiredLetter: prompt.requiredLetter,
    roundNumber: entry.roundNumber,
    scoresSnapshot: Object.fromEntries(
      Object.entries((entry.scoresSnapshot ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    winningPlayerIds: Array.isArray(entry.winningPlayerIds)
      ? entry.winningPlayerIds.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}
