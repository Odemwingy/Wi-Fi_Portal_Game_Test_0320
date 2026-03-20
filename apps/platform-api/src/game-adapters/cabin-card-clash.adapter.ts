import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  CabinCardClashStateRepository,
  type CabinCard,
  type CabinCardClashRoomState,
  type CabinCardPlay,
  type CabinCardRoundResult
} from "../repositories/cabin-card-clash-state.repository";

const PLAYER_ONE_HAND: CabinCard[] = [
  { accent: "amber", id: "host-espresso", label: "Espresso Cart", power: 3, suit: "beverage" },
  { accent: "sea", id: "host-window-kit", label: "Window Kit", power: 4, suit: "comfort" },
  { accent: "rose", id: "host-dessert", label: "Dessert Tray", power: 5, suit: "meal" },
  { accent: "mint", id: "host-mile-up", label: "Mile Upgrade", power: 6, suit: "upgrade" }
];

const PLAYER_TWO_HAND: CabinCard[] = [
  { accent: "sea", id: "guest-juice", label: "Juice Service", power: 2, suit: "beverage" },
  { accent: "mint", id: "guest-neck-pill", label: "Neck Pillow", power: 5, suit: "comfort" },
  { accent: "amber", id: "guest-hot-meal", label: "Hot Meal", power: 6, suit: "meal" },
  { accent: "rose", id: "guest-fast-track", label: "Fast Track", power: 4, suit: "upgrade" }
];

const TOTAL_ROUNDS = 4;

@Injectable()
export class CabinCardClashAdapter implements GameAdapter {
  readonly gameId = "cabin-card-clash";

  constructor(
    @Inject(CabinCardClashStateRepository)
    private readonly stateRepository: CabinCardClashStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      currentRoundCards: {},
      currentRoundNumber: 1,
      currentTurnPlayerId: hostPlayerId,
      handsByPlayer: {
        [hostPlayerId]: PLAYER_ONE_HAND
      },
      isCompleted: false,
      lastRoundResult: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      players: [hostPlayerId],
      playedCardIdsByPlayer: {
        [hostPlayerId]: []
      },
      revision: 1,
      roundResults: [],
      scores: {
        [hostPlayerId]: 0
      },
      totalRounds: TOTAL_ROUNDS,
      updatedAt: now,
      winnerPlayerIds: []
    });
  }

  async joinMatch(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    if (room.players.includes(playerId)) {
      return;
    }

    room.players.push(playerId);
    room.lastSeqByPlayer[playerId] = -1;
    room.handsByPlayer[playerId] = PLAYER_TWO_HAND;
    room.playedCardIdsByPlayer[playerId] = [];
    room.scores[playerId] = 0;
    this.bumpRevision(room);
    await this.stateRepository.set(roomId, room);
  }

  async handlePlayerAction(event: GameEventEnvelope) {
    const room = await this.getRoom(event.roomId);
    const previousSeq = room.lastSeqByPlayer[event.playerId] ?? -1;

    if (event.seq <= previousSeq) {
      return;
    }

    room.lastSeqByPlayer[event.playerId] = event.seq;

    if (room.isCompleted || room.currentTurnPlayerId !== event.playerId || room.players.length < 2) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const cardId = this.parseCardId(event.payload.cardId);
    const hand = room.handsByPlayer[event.playerId] ?? [];
    const card = hand.find((entry) => entry.id === cardId);
    const alreadyPlayed = (room.playedCardIdsByPlayer[event.playerId] ?? []).includes(cardId);

    if (!card || alreadyPlayed) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    room.currentRoundCards[event.playerId] = {
      cardId: card.id,
      playedAt: new Date().toISOString(),
      playerId: event.playerId,
      power: card.power,
      roundNumber: room.currentRoundNumber,
      seq: event.seq,
      suit: card.suit
    } satisfies CabinCardPlay;
    room.playedCardIdsByPlayer[event.playerId] = [
      ...(room.playedCardIdsByPlayer[event.playerId] ?? []),
      card.id
    ];

    const playedCount = Object.keys(room.currentRoundCards).length;
    if (playedCount < room.players.length) {
      room.currentTurnPlayerId = this.getNextPlayerId(room, event.playerId);
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const roundResult = this.resolveRound(room);
    room.roundResults.unshift(roundResult);
    room.roundResults = room.roundResults.slice(0, TOTAL_ROUNDS);
    room.lastRoundResult = roundResult;

    if (room.currentRoundNumber >= room.totalRounds) {
      room.isCompleted = true;
      room.winnerPlayerIds = getWinners(room.scores);
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    room.currentRoundNumber += 1;
    room.currentRoundCards = {};
    room.currentTurnPlayerId = this.getRoundStarter(room, roundResult);
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
        current_round_cards: room.currentRoundCards,
        current_round_number: room.currentRoundNumber,
        current_turn_player_id: room.currentTurnPlayerId,
        hands_by_player: room.handsByPlayer,
        is_completed: room.isCompleted,
        last_round_result: room.lastRoundResult,
        played_card_ids_by_player: room.playedCardIdsByPlayer,
        players: room.players,
        round_results: room.roundResults,
        scores: room.scores,
        total_rounds: room.totalRounds,
        winner_player_ids: room.winnerPlayerIds
      },
      updatedAt: room.updatedAt
    };
  }

  async reconnectPlayer(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    room.lastSeqByPlayer[playerId] = room.lastSeqByPlayer[playerId] ?? -1;
    if (!room.players.includes(playerId)) {
      room.players.push(playerId);
    }
    room.handsByPlayer[playerId] =
      room.handsByPlayer[playerId] ?? (room.players[0] === playerId ? PLAYER_ONE_HAND : PLAYER_TWO_HAND);
    room.playedCardIdsByPlayer[playerId] = room.playedCardIdsByPlayer[playerId] ?? [];
    room.scores[playerId] = room.scores[playerId] ?? 0;
    this.bumpRevision(room);
    await this.stateRepository.set(roomId, room);
  }

  async finishMatch(roomId: string) {
    await this.stateRepository.delete(roomId);
  }

  private async getRoom(roomId: string) {
    const room = await this.stateRepository.get(roomId);
    if (!room) {
      throw new Error(`Cabin Card Clash room not found: ${roomId}`);
    }
    return room;
  }

  private getNextPlayerId(room: CabinCardClashRoomState, playerId: string) {
    const currentIndex = room.players.indexOf(playerId);
    if (currentIndex === -1 || room.players.length === 0) {
      return playerId;
    }
    return room.players[(currentIndex + 1) % room.players.length] ?? playerId;
  }

  private getRoundStarter(room: CabinCardClashRoomState, result: CabinCardRoundResult) {
    if (result.winnerPlayerIds.length === 1) {
      return result.winnerPlayerIds[0]!;
    }
    return room.players[(room.currentRoundNumber - 1) % room.players.length] ?? room.players[0]!;
  }

  private parseCardId(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Cabin Card Clash expects payload.cardId");
    }
    return value;
  }

  private resolveRound(room: CabinCardClashRoomState): CabinCardRoundResult {
    const cardsByPlayer = Object.fromEntries(
      room.players.map((playerId) => [playerId, room.currentRoundCards[playerId]!])
    ) as Record<string, CabinCardPlay>;
    const highestPower = Math.max(
      ...Object.values(cardsByPlayer).map((entry) => entry.power)
    );
    const winnerPlayerIds = Object.entries(cardsByPlayer)
      .filter(([, play]) => play.power === highestPower)
      .map(([playerId]) => playerId);

    const awardedPoints = Object.fromEntries(
      room.players.map((playerId) => [
        playerId,
        winnerPlayerIds.length === 1
          ? winnerPlayerIds.includes(playerId)
            ? 3
            : 0
          : 1
      ])
    );

    for (const [playerId, points] of Object.entries(awardedPoints)) {
      room.scores[playerId] = (room.scores[playerId] ?? 0) + points;
    }

    return {
      awardedPoints,
      cardsByPlayer,
      roundNumber: room.currentRoundNumber,
      winnerPlayerIds
    };
  }

  private bumpRevision(room: CabinCardClashRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}

function getWinners(scores: Record<string, number>) {
  const highestScore = Math.max(...Object.values(scores));
  return Object.entries(scores)
    .filter(([, score]) => score === highestScore)
    .map(([playerId]) => playerId);
}
