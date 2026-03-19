import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type QuizChoice = "A" | "B" | "C" | "D";

type QuizDuelOption = {
  description: string;
  id: QuizChoice;
  label: string;
};

type QuizDuelAnswer = {
  answer: QuizChoice;
  playerId: string;
  seq: number;
  submittedAt: string;
};

export type QuizDuelRoundResult = {
  answersByPlayer: Record<string, QuizChoice | null>;
  completedAt: string;
  correctAnswer: QuizChoice;
  promptId: string;
  promptTitle: string;
  roundNumber: number;
  scoresSnapshot: Record<string, number>;
  winningPlayerIds: string[];
};

export type QuizDuelViewState = {
  allPlayersAnswered: boolean;
  answerCount: number;
  answersByPlayer: Record<string, QuizChoice | null>;
  completedRoundCount: number;
  currentRoundNumber: number;
  isCompleted: boolean;
  lastCompletedRound: QuizDuelRoundResult | null;
  prompt: {
    body: string;
    id: string;
    options: QuizDuelOption[];
    title: string;
  };
  recentAnswers: QuizDuelAnswer[];
  roundHistory: QuizDuelRoundResult[];
  scores: Record<string, number>;
  totalRounds: number;
  winningPlayerIds: string[];
};

const QUIZ_CHOICES = ["A", "B", "C", "D"] as const;

export function parseQuizDuelState(snapshot: GameStateSnapshot): QuizDuelViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const prompt = state.prompt as Record<string, unknown> | undefined;
  const options = Array.isArray(prompt?.options)
    ? prompt.options
        .map((option) => {
          const candidate = option as Record<string, unknown>;
          const id = candidate.id;
          if (!isQuizChoice(id)) {
            return null;
          }

          return {
            description: String(candidate.description ?? ""),
            id,
            label: String(candidate.label ?? id)
          };
        })
        .filter((value): value is QuizDuelOption => value !== null)
    : [];

  if (
    typeof prompt?.title !== "string" ||
    typeof prompt.body !== "string" ||
    typeof prompt.id !== "string" ||
    options.length === 0
  ) {
    return null;
  }

  const answersByPlayer = Object.fromEntries(
    Object.entries((state.answers_by_player ?? {}) as Record<string, unknown>).map(
      ([playerId, answer]) => [playerId, isQuizChoice(answer) ? answer : null]
    )
  ) as Record<string, QuizChoice | null>;

  const recentAnswers = Array.isArray(state.recent_answers)
    ? state.recent_answers
        .map((entry) => {
          const answer = entry as Record<string, unknown>;
          if (
            !isQuizChoice(answer.answer) ||
            typeof answer.playerId !== "string" ||
            typeof answer.seq !== "number" ||
            typeof answer.submittedAt !== "string"
          ) {
            return null;
          }

          return {
            answer: answer.answer,
            playerId: answer.playerId,
            seq: answer.seq,
            submittedAt: answer.submittedAt
          };
        })
        .filter((value): value is QuizDuelAnswer => value !== null)
    : [];

  const roundHistory = Array.isArray(state.round_history)
    ? state.round_history
        .map(parseQuizDuelRoundResult)
        .filter((value): value is QuizDuelRoundResult => value !== null)
    : [];

  const lastCompletedRound = parseQuizDuelRoundResult(state.last_completed_round);

  return {
    allPlayersAnswered: Boolean(state.all_players_answered),
    answerCount: Number(state.answer_count ?? 0),
    answersByPlayer,
    completedRoundCount: Number(state.completed_round_count ?? roundHistory.length),
    currentRoundNumber: Number(state.current_round_number ?? 1),
    isCompleted: Boolean(state.is_completed),
    lastCompletedRound,
    prompt: {
      body: prompt.body,
      id: prompt.id,
      options,
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

function parseQuizDuelRoundResult(value: unknown): QuizDuelRoundResult | null {
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
            !isQuizChoice(candidate.answer) ||
            typeof candidate.playerId !== "string"
          ) {
            return null;
          }

          return {
            answer: candidate.answer,
            playerId: candidate.playerId
          };
        })
        .filter(
          (
            answer
          ): answer is {
            answer: QuizChoice;
            playerId: string;
          } => answer !== null
        )
    : [];

  if (
    !isQuizChoice(entry.correctAnswer) ||
    typeof prompt?.id !== "string" ||
    typeof prompt.title !== "string" ||
    typeof entry.roundNumber !== "number" ||
    typeof entry.completedAt !== "string"
  ) {
    return null;
  }

  return {
    answersByPlayer: Object.fromEntries(
      answers.map((answer) => [answer.playerId, answer.answer])
    ) as Record<string, QuizChoice | null>,
    completedAt: entry.completedAt,
    correctAnswer: entry.correctAnswer,
    promptId: prompt.id,
    promptTitle: prompt.title,
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

function isQuizChoice(value: unknown): value is QuizChoice {
  return (
    typeof value === "string" &&
    QUIZ_CHOICES.includes(value as (typeof QUIZ_CHOICES)[number])
  );
}
