import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  MemoryMatchDuelStateRepository,
  type MemoryMatchRecentMove,
  type MemoryMatchResolvedTurn,
  type MemoryMatchRoomState
} from "../repositories/memory-match-duel-state.repository";

type BoardDefinition = Array<{
  id: string;
  label: string;
  pairId: string;
}>;

const BOARD_DEFINITION: BoardDefinition = [
  { id: "boarding-pass-a", label: "Boarding Pass", pairId: "boarding-pass" },
  { id: "headset-a", label: "Headset", pairId: "headset" },
  { id: "boarding-pass-b", label: "Boarding Pass", pairId: "boarding-pass" },
  { id: "cabin-bag-a", label: "Cabin Bag", pairId: "cabin-bag" },
  { id: "headset-b", label: "Headset", pairId: "headset" },
  { id: "cabin-bag-b", label: "Cabin Bag", pairId: "cabin-bag" }
];

@Injectable()
export class MemoryMatchDuelAdapter implements GameAdapter {
  readonly gameId = "memory-match-duel";

  constructor(
    @Inject(MemoryMatchDuelStateRepository)
    private readonly stateRepository: MemoryMatchDuelStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      board: BOARD_DEFINITION.map((card) => ({
        ...card,
        status: "hidden"
      })),
      currentTurnPlayerId: hostPlayerId,
      isCompleted: false,
      lastResolvedTurn: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      matchedPairCount: 0,
      players: [hostPlayerId],
      recentMoves: [],
      revision: 1,
      roundNumber: 1,
      scores: {
        [hostPlayerId]: 0
      },
      selection: [],
      selectionOwnerPlayerId: null,
      totalPairs: BOARD_DEFINITION.length / 2,
      updatedAt: now
    });
  }

  async joinMatch(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    if (room.players.includes(playerId)) {
      return;
    }

    room.players.push(playerId);
    room.lastSeqByPlayer[playerId] = -1;
    room.scores[playerId] = room.scores[playerId] ?? 0;
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

    if (room.isCompleted || room.currentTurnPlayerId !== event.playerId) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const cardIndex = this.parseCardIndex(event.payload.cardIndex);
    const selectedCard = room.board[cardIndex];

    if (!selectedCard || selectedCard.status === "matched" || selectedCard.status === "revealed") {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    if (room.selection.length === 0) {
      room.selectionOwnerPlayerId = event.playerId;
    }

    if (room.selectionOwnerPlayerId !== event.playerId) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    selectedCard.status = "revealed";
    room.selection.push(cardIndex);
    room.recentMoves.unshift({
      cardId: selectedCard.id,
      cardIndex,
      playerId: event.playerId,
      revealedAt: new Date().toISOString(),
      seq: event.seq
    } satisfies MemoryMatchRecentMove);
    room.recentMoves = room.recentMoves.slice(0, 8);

    if (room.selection.length < 2) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const [firstIndex, secondIndex] = room.selection;
    const firstCard = room.board[firstIndex];
    const secondCard = room.board[secondIndex];
    const matched =
      firstCard !== undefined &&
      secondCard !== undefined &&
      firstCard.pairId === secondCard.pairId;

    if (!firstCard || !secondCard) {
      throw new Error("Memory Match selection could not be resolved");
    }

    if (matched) {
      firstCard.status = "matched";
      secondCard.status = "matched";
      room.matchedPairCount += 1;
      room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + 12;
    } else {
      firstCard.status = "hidden";
      secondCard.status = "hidden";
      room.currentTurnPlayerId = this.getNextPlayerId(room, event.playerId);
    }

    room.lastResolvedTurn = {
      cards: [firstCard.id, secondCard.id],
      completedAt: new Date().toISOString(),
      matched,
      playerId: event.playerId,
      roundNumber: room.roundNumber,
      scoresSnapshot: { ...room.scores }
    } satisfies MemoryMatchResolvedTurn;

    room.roundNumber += 1;
    room.selection = [];
    room.selectionOwnerPlayerId = null;

    if (room.matchedPairCount >= room.totalPairs) {
      room.isCompleted = true;
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
        board: room.board,
        current_turn_player_id: room.currentTurnPlayerId,
        is_completed: room.isCompleted,
        last_resolved_turn: room.lastResolvedTurn,
        matched_pair_count: room.matchedPairCount,
        players: room.players,
        recent_moves: room.recentMoves,
        round_number: room.roundNumber,
        scores: room.scores,
        selection: room.selection,
        selection_owner_player_id: room.selectionOwnerPlayerId,
        total_pairs: room.totalPairs,
        winning_player_ids: this.getWinningPlayerIds(room)
      },
      updatedAt: room.updatedAt
    };
  }

  async reconnectPlayer(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    room.lastSeqByPlayer[playerId] = room.lastSeqByPlayer[playerId] ?? -1;
    room.scores[playerId] = room.scores[playerId] ?? 0;
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
      throw new Error(`Memory Match room not found: ${roomId}`);
    }
    return room;
  }

  private parseCardIndex(value: unknown) {
    if (!Number.isInteger(value)) {
      throw new Error("Memory Match expects payload.cardIndex to be an integer");
    }

    return Number(value);
  }

  private getNextPlayerId(room: MemoryMatchRoomState, playerId: string) {
    const currentIndex = room.players.indexOf(playerId);
    if (currentIndex === -1 || room.players.length === 0) {
      return playerId;
    }

    return room.players[(currentIndex + 1) % room.players.length] ?? playerId;
  }

  private getWinningPlayerIds(room: MemoryMatchRoomState) {
    const highestScore = Math.max(...Object.values(room.scores));
    return Object.entries(room.scores)
      .filter(([, score]) => score === highestScore)
      .map(([playerId]) => playerId);
  }

  private bumpRevision(room: MemoryMatchRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}
