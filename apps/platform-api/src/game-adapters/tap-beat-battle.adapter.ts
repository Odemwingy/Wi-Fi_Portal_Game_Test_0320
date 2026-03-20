import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  TapBeatBattleStateRepository,
  type TapBeatAction,
  type TapBeatBattleRoomState,
  type TapBeatCue,
  type TapBeatLaneId,
  type TapBeatRoundResult
} from "../repositories/tap-beat-battle-state.repository";

const ROUND_PATTERNS: TapBeatCue[][] = [
  [
    { accent: "amber", id: "r1-left", laneId: "left", label: "Tap Left", points: 3 },
    { accent: "mint", id: "r1-center", laneId: "center", label: "Tap Center", points: 4 },
    { accent: "rose", id: "r1-right", laneId: "right", label: "Tap Right", points: 5 },
    { accent: "mint", id: "r1-center-2", laneId: "center", label: "Tap Center", points: 4 }
  ],
  [
    { accent: "rose", id: "r2-right", laneId: "right", label: "Tap Right", points: 5 },
    { accent: "amber", id: "r2-left", laneId: "left", label: "Tap Left", points: 3 },
    { accent: "mint", id: "r2-center", laneId: "center", label: "Tap Center", points: 4 },
    { accent: "rose", id: "r2-right-2", laneId: "right", label: "Tap Right", points: 5 }
  ],
  [
    { accent: "mint", id: "r3-center", laneId: "center", label: "Tap Center", points: 4 },
    { accent: "amber", id: "r3-left", laneId: "left", label: "Tap Left", points: 3 },
    { accent: "rose", id: "r3-right", laneId: "right", label: "Tap Right", points: 5 },
    { accent: "amber", id: "r3-left-2", laneId: "left", label: "Tap Left", points: 3 }
  ]
];

@Injectable()
export class TapBeatBattleAdapter implements GameAdapter {
  readonly gameId = "tap-beat-battle";

  constructor(
    @Inject(TapBeatBattleStateRepository)
    private readonly stateRepository: TapBeatBattleStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      completedRounds: [],
      currentPattern: this.getRoundPattern(1),
      currentRoundNumber: 1,
      isCompleted: false,
      lastAction: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      players: [hostPlayerId],
      progressByPlayer: {
        [hostPlayerId]: 0
      },
      recentActions: [],
      revision: 1,
      roundScoresByPlayer: {
        [hostPlayerId]: 0
      },
      scores: {
        [hostPlayerId]: 0
      },
      totalRounds: ROUND_PATTERNS.length,
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
    room.progressByPlayer[playerId] = 0;
    room.roundScoresByPlayer[playerId] = 0;
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

    if (room.isCompleted || room.players.length < 2) {
      this.recordRejectedAction(room, event.playerId, event.seq, event.payload.laneId);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const laneId = this.parseLaneId(event.payload.laneId);
    const currentStep = room.progressByPlayer[event.playerId] ?? 0;
    const expectedCue = room.currentPattern[currentStep] ?? null;

    if (!expectedCue) {
      this.recordRejectedAction(room, event.playerId, event.seq, laneId);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const isAccepted = expectedCue.laneId === laneId;
    const pointsAwarded = isAccepted ? expectedCue.points : 0;

    room.progressByPlayer[event.playerId] = currentStep + 1;
    room.roundScoresByPlayer[event.playerId] =
      (room.roundScoresByPlayer[event.playerId] ?? 0) + pointsAwarded;
    room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + pointsAwarded;

    room.lastAction = {
      cueId: expectedCue.id,
      expectedLaneId: expectedCue.laneId,
      laneId,
      playerId: event.playerId,
      pointsAwarded,
      roundNumber: room.currentRoundNumber,
      seq: event.seq,
      status: isAccepted ? "accepted" : "rejected",
      stepNumber: currentStep + 1,
      submittedAt: new Date().toISOString()
    } satisfies TapBeatAction;
    room.recentActions = [room.lastAction, ...room.recentActions].slice(0, 8);

    if (
      room.players.every(
        (playerId) => (room.progressByPlayer[playerId] ?? 0) >= room.currentPattern.length
      )
    ) {
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
        completed_round_count: room.completedRounds.length,
        current_pattern: room.currentPattern,
        current_round_number: room.currentRoundNumber,
        is_completed: room.isCompleted,
        last_action: room.lastAction,
        last_completed_round:
          room.completedRounds.length === 0 ? null : room.completedRounds[room.completedRounds.length - 1],
        next_cue_by_player: Object.fromEntries(
          room.players.map((playerId) => [
            playerId,
            room.currentPattern[room.progressByPlayer[playerId] ?? 0] ?? null
          ])
        ),
        players: room.players,
        progress_by_player: room.progressByPlayer,
        recent_actions: room.recentActions,
        round_history: room.completedRounds.slice(-3).reverse(),
        round_scores_by_player: room.roundScoresByPlayer,
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
    room.progressByPlayer[playerId] = room.progressByPlayer[playerId] ?? 0;
    room.roundScoresByPlayer[playerId] = room.roundScoresByPlayer[playerId] ?? 0;
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
      throw new Error(`Tap Beat Battle room not found: ${roomId}`);
    }
    return room;
  }

  private parseLaneId(value: unknown): TapBeatLaneId {
    if (value === "left" || value === "center" || value === "right") {
      return value;
    }
    throw new Error("Tap Beat Battle expects payload.laneId");
  }

  private recordRejectedAction(
    room: TapBeatBattleRoomState,
    playerId: string,
    seq: number,
    laneId: unknown
  ) {
    room.lastAction = {
      cueId: null,
      expectedLaneId: null,
      laneId: this.toFallbackLane(laneId),
      playerId,
      pointsAwarded: 0,
      roundNumber: room.currentRoundNumber,
      seq,
      status: "rejected",
      stepNumber: room.progressByPlayer[playerId] ?? 0,
      submittedAt: new Date().toISOString()
    };
    room.recentActions = [room.lastAction, ...room.recentActions].slice(0, 8);
    this.bumpRevision(room);
  }

  private completeRound(room: TapBeatBattleRoomState) {
    const roundResult: TapBeatRoundResult = {
      completedAt: new Date().toISOString(),
      pattern: room.currentPattern,
      roundNumber: room.currentRoundNumber,
      roundScores: { ...room.roundScoresByPlayer },
      scoresSnapshot: { ...room.scores },
      winnerPlayerIds: this.getRoundWinnerPlayerIds(room)
    };

    room.completedRounds.push(roundResult);

    if (room.currentRoundNumber >= room.totalRounds) {
      room.isCompleted = true;
      room.winnerPlayerIds = this.getOverallWinnerPlayerIds(room);
      this.bumpRevision(room);
      return;
    }

    const nextRoundNumber = room.currentRoundNumber + 1;
    room.currentPattern = this.getRoundPattern(nextRoundNumber);
    room.currentRoundNumber = nextRoundNumber;
    room.progressByPlayer = Object.fromEntries(
      room.players.map((playerId) => [playerId, 0])
    ) as Record<string, number>;
    room.roundScoresByPlayer = Object.fromEntries(
      room.players.map((playerId) => [playerId, 0])
    ) as Record<string, number>;
    room.isCompleted = false;

    this.bumpRevision(room);
  }

  private getRoundPattern(roundNumber: number) {
    const pattern = ROUND_PATTERNS[roundNumber - 1];
    if (!pattern) {
      throw new Error(`Tap Beat Battle pattern missing for round ${roundNumber}`);
    }
    return pattern;
  }

  private getRoundWinnerPlayerIds(room: TapBeatBattleRoomState) {
    const highestScore = Math.max(...Object.values(room.roundScoresByPlayer));
    return room.players.filter(
      (playerId) => (room.roundScoresByPlayer[playerId] ?? 0) === highestScore
    );
  }

  private getOverallWinnerPlayerIds(room: TapBeatBattleRoomState) {
    const highestScore = Math.max(...Object.values(room.scores));
    return room.players.filter((playerId) => (room.scores[playerId] ?? 0) === highestScore);
  }

  private toFallbackLane(value: unknown): TapBeatLaneId {
    if (value === "left" || value === "center" || value === "right") {
      return value;
    }
    return "center";
  }

  private bumpRevision(room: TapBeatBattleRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}
