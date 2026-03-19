import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  QuizDuelStateRepository,
  type QuizChoice,
  type QuizPrompt,
  type QuizRoundResult,
  type QuizDuelRoomState
} from "../repositories/quiz-duel-state.repository";

type QuizPromptDefinition = {
  correctAnswer: QuizChoice;
  prompt: QuizPrompt;
};

const PROMPT_DECK: QuizPromptDefinition[] = [
  {
    correctAnswer: "A",
    prompt: {
      body:
        "Before takeoff, which item must stay visible and securely fastened whenever the seatbelt sign is on?",
      id: "safety-briefing-001",
      options: [
        {
          description: "Keep it low and tight across your lap.",
          id: "A",
          label: "Seatbelt"
        },
        {
          description: "Use only during cabin-service windows.",
          id: "B",
          label: "Tray table"
        },
        {
          description: "Can stay loose if you are seated by the window.",
          id: "C",
          label: "Blanket strap"
        },
        {
          description: "Only required during boarding.",
          id: "D",
          label: "Headrest cover"
        }
      ],
      title: "Cabin Safety Quickfire"
    }
  },
  {
    correctAnswer: "C",
    prompt: {
      body:
        "Which light means passengers should return to their seats because turbulence is expected ahead?",
      id: "cabin-signals-002",
      options: [
        {
          description: "The galley coffee warmer light.",
          id: "A",
          label: "Service amber"
        },
        {
          description: "The lavatory occupancy light.",
          id: "B",
          label: "Door status blue"
        },
        {
          description: "The illuminated seatbelt sign.",
          id: "C",
          label: "Seatbelt sign"
        },
        {
          description: "The reading-lamp indicator.",
          id: "D",
          label: "Reading light"
        }
      ],
      title: "Turbulence Signals"
    }
  },
  {
    correctAnswer: "D",
    prompt: {
      body:
        "During taxi, which device mode is typically requested before takeoff so cabin systems remain interference-safe?",
      id: "device-mode-003",
      options: [
        {
          description: "Maximum speaker volume mode.",
          id: "A",
          label: "Cabin audio boost"
        },
        {
          description: "Battery saver with Bluetooth only.",
          id: "B",
          label: "Low power mode"
        },
        {
          description: "Screen-off background sync mode.",
          id: "C",
          label: "Silent background mode"
        },
        {
          description: "Airplane mode, with airline Wi-Fi enabled only after allowed.",
          id: "D",
          label: "Airplane mode"
        }
      ],
      title: "Connected Cabin Etiquette"
    }
  }
];

@Injectable()
export class QuizDuelAdapter implements GameAdapter {
  readonly gameId = "quiz-duel";

  constructor(
    @Inject(QuizDuelStateRepository)
    private readonly stateRepository: QuizDuelStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();
    const currentRound = this.getRoundDefinition(1);
    await this.stateRepository.set(roomId, {
      answers: [],
      answersByPlayer: {
        [hostPlayerId]: null
      },
      completedRounds: [],
      correctAnswer: currentRound.correctAnswer,
      currentRoundNumber: 1,
      isCompleted: false,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      players: [hostPlayerId],
      prompt: currentRound.prompt,
      revision: 1,
      scores: {
        [hostPlayerId]: 0
      },
      totalRounds: PROMPT_DECK.length,
      updatedAt: now
    });
  }

  async joinMatch(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    if (room.players.includes(playerId)) {
      return;
    }

    room.players.push(playerId);
    room.answersByPlayer[playerId] = room.answersByPlayer[playerId] ?? null;
    room.lastSeqByPlayer[playerId] = -1;
    room.scores[playerId] = room.scores[playerId] ?? 0;
    this.bumpRevision(room);
  }

  async handlePlayerAction(event: GameEventEnvelope) {
    const room = await this.getRoom(event.roomId);
    const answer = this.parseAnswer(event.payload.answer);
    const previousSeq = room.lastSeqByPlayer[event.playerId] ?? -1;

    if (event.seq <= previousSeq) {
      return;
    }

    if (room.answersByPlayer[event.playerId]) {
      room.lastSeqByPlayer[event.playerId] = event.seq;
      this.bumpRevision(room);
      return;
    }

    room.lastSeqByPlayer[event.playerId] = event.seq;
    room.answersByPlayer[event.playerId] = answer;
    room.answers.push({
      answer,
      playerId: event.playerId,
      seq: event.seq,
      submittedAt: new Date().toISOString()
    });

    if (answer === room.correctAnswer) {
      room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + 10;
    }

    if (room.players.every((playerId) => room.answersByPlayer[playerId] !== null)) {
      this.completeRound(room);
      return;
    }

    this.bumpRevision(room);
  }

  async getSnapshot(roomId: string): Promise<GameStateSnapshot> {
    const room = await this.getRoom(roomId);
    return {
      gameId: this.gameId,
      roomId,
      revision: room.revision,
      state: {
        all_players_answered: room.players.every(
          (playerId) => room.answersByPlayer[playerId] !== null
        ),
        answer_count: room.answers.length,
        answers_by_player: room.answersByPlayer,
        completed_round_count: room.completedRounds.length,
        current_round_number: room.currentRoundNumber,
        is_completed: room.isCompleted,
        last_answer:
          room.answers.length === 0
            ? null
            : room.answers[room.answers.length - 1],
        last_completed_round:
          room.completedRounds.length === 0
            ? null
            : room.completedRounds[room.completedRounds.length - 1],
        players: room.players,
        prompt: room.prompt,
        prompt_id: room.prompt.id,
        recent_answers: room.answers.slice(-6).reverse(),
        round_history: room.completedRounds.slice(-3).reverse(),
        scores: room.scores,
        total_rounds: room.totalRounds,
        winning_player_ids: this.getWinningPlayerIds(room)
      },
      updatedAt: room.updatedAt
    };
  }

  async reconnectPlayer(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    room.answersByPlayer[playerId] = room.answersByPlayer[playerId] ?? null;
    room.scores[playerId] = room.scores[playerId] ?? 0;
    room.lastSeqByPlayer[playerId] = room.lastSeqByPlayer[playerId] ?? -1;
    if (!room.players.includes(playerId)) {
      room.players.push(playerId);
    }
    this.bumpRevision(room);
  }

  async finishMatch(roomId: string) {
    await this.stateRepository.delete(roomId);
  }

  private bumpRevision(room: QuizDuelRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }

  private async getRoom(roomId: string) {
    const room = await this.stateRepository.get(roomId);
    if (!room) {
      throw new Error(`Quiz Duel room not found: ${roomId}`);
    }
    return room;
  }

  private parseAnswer(value: unknown): QuizChoice {
    if (value === "A" || value === "B" || value === "C" || value === "D") {
      return value;
    }
    throw new Error("Quiz Duel expects payload.answer to be one of A, B, C, D");
  }

  private getWinningPlayerIds(room: QuizDuelRoomState) {
    const highestScore = Math.max(...Object.values(room.scores));
    return Object.entries(room.scores)
      .filter(([, score]) => score === highestScore)
      .map(([playerId]) => playerId);
  }

  private completeRound(room: QuizDuelRoomState) {
    const completedRound: QuizRoundResult = {
      answers: [...room.answers],
      completedAt: new Date().toISOString(),
      correctAnswer: room.correctAnswer,
      prompt: room.prompt,
      roundNumber: room.currentRoundNumber,
      scoresSnapshot: { ...room.scores },
      winningPlayerIds: this.getWinningPlayerIds(room)
    };

    room.completedRounds.push(completedRound);

    if (room.currentRoundNumber >= room.totalRounds) {
      room.isCompleted = true;
      this.bumpRevision(room);
      return;
    }

    const nextRoundNumber = room.currentRoundNumber + 1;
    const nextRound = this.getRoundDefinition(nextRoundNumber);

    room.answers = [];
    room.answersByPlayer = Object.fromEntries(
      room.players.map((playerId) => [playerId, null])
    ) as Record<string, QuizChoice | null>;
    room.correctAnswer = nextRound.correctAnswer;
    room.currentRoundNumber = nextRoundNumber;
    room.prompt = nextRound.prompt;
    room.isCompleted = false;

    this.bumpRevision(room);
  }

  private getRoundDefinition(roundNumber: number) {
    const definition = PROMPT_DECK[roundNumber - 1];
    if (!definition) {
      throw new Error(`Quiz Duel prompt not found for round ${roundNumber}`);
    }
    return definition;
  }
}
