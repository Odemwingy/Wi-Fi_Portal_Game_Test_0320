import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  RouteBuilderDuelStateRepository,
  type RouteBuilderLeg,
  type RouteBuilderMove,
  type RouteBuilderRoomState
} from "../repositories/route-builder-duel-state.repository";

@Injectable()
export class RouteBuilderDuelAdapter implements GameAdapter {
  readonly gameId = "route-builder-duel";

  constructor(
    @Inject(RouteBuilderDuelStateRepository)
    private readonly stateRepository: RouteBuilderDuelStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      availableLegCount: ROUTE_LEGS.length,
      currentTurnPlayerId: hostPlayerId,
      isCompleted: false,
      lastMove: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      legs: createRouteLegs(),
      moves: [],
      playerMarks: {
        [hostPlayerId]: "C"
      },
      players: [hostPlayerId],
      revision: 1,
      scores: {
        [hostPlayerId]: 0
      },
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
    room.playerMarks[playerId] = room.playerMarks[playerId] ?? getNextMark(room.playerMarks);
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

    if (room.isCompleted || room.currentTurnPlayerId !== event.playerId || room.players.length < 2) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const legId = this.parseLegId(event.payload.legId);
    const leg = room.legs.find((entry) => entry.legId === legId);

    if (!leg || leg.ownerPlayerId) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const comboBonus = getLaneComboBonus(room.legs, leg, event.playerId);
    const pointsAwarded = leg.baseScore + comboBonus;

    leg.ownerPlayerId = event.playerId;
    room.availableLegCount -= 1;
    room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + pointsAwarded;
    room.lastMove = {
      comboBonus,
      lane: leg.lane,
      legId,
      playerId: event.playerId,
      pointsAwarded,
      selectedAt: new Date().toISOString(),
      seq: event.seq
    } satisfies RouteBuilderMove;
    room.moves.unshift(room.lastMove);
    room.moves = room.moves.slice(0, ROUTE_LEGS.length);

    if (room.availableLegCount === 0) {
      room.isCompleted = true;
      room.winnerPlayerIds = getWinners(room.scores);
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    room.currentTurnPlayerId = this.getNextPlayerId(room, event.playerId);
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
        available_leg_count: room.availableLegCount,
        current_turn_player_id: room.currentTurnPlayerId,
        is_completed: room.isCompleted,
        last_move: room.lastMove,
        legs: room.legs,
        moves: room.moves.slice(0, 10),
        player_marks: room.playerMarks,
        players: room.players,
        scores: room.scores,
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
    room.playerMarks[playerId] = room.playerMarks[playerId] ?? getNextMark(room.playerMarks);
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
      throw new Error(`Route Builder Duel room not found: ${roomId}`);
    }
    return room;
  }

  private getNextPlayerId(room: RouteBuilderRoomState, playerId: string) {
    const currentIndex = room.players.indexOf(playerId);
    if (currentIndex === -1 || room.players.length === 0) {
      return playerId;
    }

    return room.players[(currentIndex + 1) % room.players.length] ?? playerId;
  }

  private parseLegId(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Route Builder Duel expects payload.legId");
    }

    return value;
  }

  private bumpRevision(room: RouteBuilderRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}

const ROUTE_LEGS: Omit<RouteBuilderLeg, "ownerPlayerId">[] = [
  {
    baseScore: 3,
    fromLabel: "Shanghai",
    lane: "central",
    legId: "leg-sgh-hkg",
    toLabel: "Hong Kong"
  },
  {
    baseScore: 4,
    fromLabel: "Hong Kong",
    lane: "coastal",
    legId: "leg-hkg-sin",
    toLabel: "Singapore"
  },
  {
    baseScore: 3,
    fromLabel: "Singapore",
    lane: "northern",
    legId: "leg-sin-bkk",
    toLabel: "Bangkok"
  },
  {
    baseScore: 4,
    fromLabel: "Bangkok",
    lane: "central",
    legId: "leg-bkk-hnd",
    toLabel: "Tokyo"
  },
  {
    baseScore: 5,
    fromLabel: "Tokyo",
    lane: "coastal",
    legId: "leg-hnd-icn",
    toLabel: "Seoul"
  },
  {
    baseScore: 4,
    fromLabel: "Seoul",
    lane: "northern",
    legId: "leg-icn-pvg",
    toLabel: "Shanghai"
  }
];

function createRouteLegs(): RouteBuilderLeg[] {
  return ROUTE_LEGS.map((leg) => ({
    ...leg,
    ownerPlayerId: null
  }));
}

function getNextMark(playerMarks: Record<string, "C" | "F">) {
  const usedMarks = new Set(Object.values(playerMarks));
  return usedMarks.has("C") ? "F" : "C";
}

function getLaneComboBonus(
  legs: RouteBuilderLeg[],
  claimedLeg: RouteBuilderLeg,
  playerId: string
) {
  return legs.some(
    (leg) =>
      leg.ownerPlayerId === playerId &&
      leg.legId !== claimedLeg.legId &&
      leg.lane === claimedLeg.lane
  )
    ? 1
    : 0;
}

function getWinners(scores: Record<string, number>) {
  const highestScore = Math.max(...Object.values(scores));
  return Object.entries(scores)
    .filter(([, score]) => score === highestScore)
    .map(([playerId]) => playerId);
}
