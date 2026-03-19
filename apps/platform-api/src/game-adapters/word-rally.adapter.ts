import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  WordRallyStateRepository,
  type WordRallyPrompt,
  type WordRallyRoundResult,
  type WordRallyRoomState
} from "../repositories/word-rally-state.repository";

type WordRallyPromptDefinition = {
  correctOptionId: string;
  prompt: WordRallyPrompt;
};

const PROMPT_DECK: WordRallyPromptDefinition[] = [
  {
    correctOptionId: "cloud",
    prompt: {
      body: "Select the best travel word that starts with C and fits an onboard route-planning theme.",
      category: "Route Planning",
      id: "word-rally-001",
      options: [
        {
          description: "Weather conditions pilots watch on long-haul routes.",
          id: "cloud",
          label: "Cloud"
        },
        {
          description: "Cabin item, but it does not start with C in English here.",
          id: "seat",
          label: "Seat"
        },
        {
          description: "Meal timing term, but the required letter is different.",
          id: "snack",
          label: "Snack"
        },
        {
          description: "Airport movement term, but the starting letter does not match.",
          id: "taxi",
          label: "Taxi"
        }
      ],
      requiredLetter: "C",
      title: "Letter C Warm-up"
    }
  },
  {
    correctOptionId: "gate",
    prompt: {
      body: "Choose the airport word that starts with G and best matches boarding flow.",
      category: "Airport Ops",
      id: "word-rally-002",
      options: [
        {
          description: "The place where passengers board the aircraft.",
          id: "gate",
          label: "Gate"
        },
        {
          description: "Useful onboard term, but not related to boarding flow here.",
          id: "galley",
          label: "Galley"
        },
        {
          description: "Flight crew concept, but not the boarding checkpoint.",
          id: "ground",
          label: "Ground"
        },
        {
          description: "It starts with G, but it is not an airport touchpoint.",
          id: "globe",
          label: "Globe"
        }
      ],
      requiredLetter: "G",
      title: "Boarding Word Rush"
    }
  },
  {
    correctOptionId: "landing",
    prompt: {
      body: "Pick the aviation word that starts with L and best matches the final phase of the trip.",
      category: "Flight Sequence",
      id: "word-rally-003",
      options: [
        {
          description: "The arrival phase when the aircraft returns to the runway.",
          id: "landing",
          label: "Landing"
        },
        {
          description: "Cabin item, but not the end-of-trip phase.",
          id: "luggage",
          label: "Luggage"
        },
        {
          description: "Seat location term, but not a flight phase.",
          id: "left",
          label: "Left"
        },
        {
          description: "A calm cabin mood, but not an aviation milestone.",
          id: "leisure",
          label: "Leisure"
        }
      ],
      requiredLetter: "L",
      title: "Final Approach Sprint"
    }
  }
];

@Injectable()
export class WordRallyAdapter implements GameAdapter {
  readonly gameId = "word-rally";

  constructor(
    @Inject(WordRallyStateRepository)
    private readonly stateRepository: WordRallyStateRepository
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
      correctOptionId: currentRound.correctOptionId,
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
    await this.stateRepository.set(roomId, room);
  }

  async handlePlayerAction(event: GameEventEnvelope) {
    const room = await this.getRoom(event.roomId);
    const answerId = this.parseAnswerId(event.payload.wordId);
    const previousSeq = room.lastSeqByPlayer[event.playerId] ?? -1;

    if (event.seq <= previousSeq) {
      return;
    }

    if (room.answersByPlayer[event.playerId]) {
      room.lastSeqByPlayer[event.playerId] = event.seq;
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    room.lastSeqByPlayer[event.playerId] = event.seq;
    room.answersByPlayer[event.playerId] = answerId;
    room.answers.push({
      answerId,
      playerId: event.playerId,
      seq: event.seq,
      submittedAt: new Date().toISOString()
    });

    if (answerId === room.correctOptionId) {
      room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + 10;
    }

    if (room.players.every((playerId) => room.answersByPlayer[playerId] !== null)) {
      this.completeRound(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    this.bumpRevision(room);
    await this.stateRepository.set(event.roomId, room);
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
        correct_option_id: room.correctOptionId,
        current_round_number: room.currentRoundNumber,
        is_completed: room.isCompleted,
        last_answer:
          room.answers.length === 0 ? null : room.answers[room.answers.length - 1],
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
    await this.stateRepository.set(roomId, room);
  }

  async finishMatch(roomId: string) {
    await this.stateRepository.delete(roomId);
  }

  private async getRoom(roomId: string) {
    const room = await this.stateRepository.get(roomId);
    if (!room) {
      throw new Error(`Word Rally room not found: ${roomId}`);
    }
    return room;
  }

  private parseAnswerId(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Word Rally expects payload.wordId to be a non-empty string");
    }

    return value.trim();
  }

  private completeRound(room: WordRallyRoomState) {
    const completedRound: WordRallyRoundResult = {
      answers: [...room.answers],
      completedAt: new Date().toISOString(),
      correctOptionId: room.correctOptionId,
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
    ) as Record<string, string | null>;
    room.correctOptionId = nextRound.correctOptionId;
    room.currentRoundNumber = nextRoundNumber;
    room.isCompleted = false;
    room.prompt = nextRound.prompt;

    this.bumpRevision(room);
  }

  private getRoundDefinition(roundNumber: number) {
    const definition = PROMPT_DECK[roundNumber - 1];
    if (!definition) {
      throw new Error(`Word Rally prompt not found for round ${roundNumber}`);
    }
    return definition;
  }

  private getWinningPlayerIds(room: WordRallyRoomState) {
    const highestScore = Math.max(...Object.values(room.scores));
    return Object.entries(room.scores)
      .filter(([, score]) => score === highestScore)
      .map(([playerId]) => playerId);
  }

  private bumpRevision(room: WordRallyRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}
