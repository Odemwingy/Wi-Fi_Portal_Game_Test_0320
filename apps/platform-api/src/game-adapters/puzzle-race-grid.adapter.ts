import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  PuzzleRaceGridStateRepository,
  type PuzzleGridCell,
  type PuzzleGridMove,
  type PuzzleRaceGridRoomState
} from "../repositories/puzzle-race-grid-state.repository";

const TARGET_CELL_IDS = [
  "grid-a1",
  "grid-b2",
  "grid-c3",
  "grid-d4",
  "grid-c4"
];

const GRID_CELLS: Omit<PuzzleGridCell, "ownerPlayerId">[] = [
  { cellId: "grid-a1", col: 0, row: 0, targetIndex: 0, tone: "amber", value: 2 },
  { cellId: "grid-a2", col: 1, row: 0, targetIndex: 5, tone: "sea", value: 1 },
  { cellId: "grid-a3", col: 2, row: 0, targetIndex: 6, tone: "mint", value: 3 },
  { cellId: "grid-a4", col: 3, row: 0, targetIndex: 7, tone: "rose", value: 2 },
  { cellId: "grid-b1", col: 0, row: 1, targetIndex: 8, tone: "sea", value: 3 },
  { cellId: "grid-b2", col: 1, row: 1, targetIndex: 1, tone: "mint", value: 4 },
  { cellId: "grid-b3", col: 2, row: 1, targetIndex: 9, tone: "rose", value: 2 },
  { cellId: "grid-b4", col: 3, row: 1, targetIndex: 10, tone: "amber", value: 3 },
  { cellId: "grid-c1", col: 0, row: 2, targetIndex: 11, tone: "mint", value: 2 },
  { cellId: "grid-c2", col: 1, row: 2, targetIndex: 12, tone: "rose", value: 4 },
  { cellId: "grid-c3", col: 2, row: 2, targetIndex: 2, tone: "sea", value: 5 },
  { cellId: "grid-c4", col: 3, row: 2, targetIndex: 4, tone: "amber", value: 4 },
  { cellId: "grid-d1", col: 0, row: 3, targetIndex: 13, tone: "rose", value: 2 },
  { cellId: "grid-d2", col: 1, row: 3, targetIndex: 14, tone: "amber", value: 3 },
  { cellId: "grid-d3", col: 2, row: 3, targetIndex: 15, tone: "mint", value: 1 },
  { cellId: "grid-d4", col: 3, row: 3, targetIndex: 3, tone: "sea", value: 6 }
];

@Injectable()
export class PuzzleRaceGridAdapter implements GameAdapter {
  readonly gameId = "puzzle-race-grid";

  constructor(
    @Inject(PuzzleRaceGridStateRepository)
    private readonly stateRepository: PuzzleRaceGridStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      cells: createCells(),
      completedAtByPlayer: {
        [hostPlayerId]: null
      },
      currentLeaderPlayerId: null,
      isCompleted: false,
      lastMove: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      players: [hostPlayerId],
      progressByPlayer: {
        [hostPlayerId]: 0
      },
      revision: 1,
      scores: {
        [hostPlayerId]: 0
      },
      targetCellIds: TARGET_CELL_IDS,
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
    room.completedAtByPlayer[playerId] = null;
    room.lastSeqByPlayer[playerId] = -1;
    room.progressByPlayer[playerId] = 0;
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
      this.recordIgnoredMove(room, event.playerId, event.seq, event.payload.cellId);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const cellId = this.parseCellId(event.payload.cellId);
    const expectedCellId =
      room.targetCellIds[room.progressByPlayer[event.playerId] ?? 0] ?? null;
    const cell = room.cells.find((entry) => entry.cellId === cellId);

    if (!cell || cellId !== expectedCellId || cell.ownerPlayerId) {
      this.recordIgnoredMove(room, event.playerId, event.seq, cellId);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    cell.ownerPlayerId = event.playerId;
    room.progressByPlayer[event.playerId] = (room.progressByPlayer[event.playerId] ?? 0) + 1;
    room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + cell.value;
    room.currentLeaderPlayerId = getLeader(room.scores);
    room.lastMove = {
      cellId,
      playerId: event.playerId,
      pointsAwarded: cell.value,
      progressAfter: room.progressByPlayer[event.playerId],
      seq: event.seq,
      selectedAt: new Date().toISOString(),
      status: "accepted"
    } satisfies PuzzleGridMove;

    if (room.progressByPlayer[event.playerId] >= room.targetCellIds.length) {
      room.completedAtByPlayer[event.playerId] = room.lastMove.selectedAt;
      room.isCompleted = true;
      room.winnerPlayerIds = [event.playerId];
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
        cells: room.cells,
        completed_at_by_player: room.completedAtByPlayer,
        current_leader_player_id: room.currentLeaderPlayerId,
        is_completed: room.isCompleted,
        last_move: room.lastMove,
        next_target_by_player: Object.fromEntries(
          room.players.map((playerId) => [
            playerId,
            room.targetCellIds[room.progressByPlayer[playerId] ?? 0] ?? null
          ])
        ),
        players: room.players,
        progress_by_player: room.progressByPlayer,
        scores: room.scores,
        target_cell_ids: room.targetCellIds,
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
    room.completedAtByPlayer[playerId] = room.completedAtByPlayer[playerId] ?? null;
    room.progressByPlayer[playerId] = room.progressByPlayer[playerId] ?? 0;
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
      throw new Error(`Puzzle Race Grid room not found: ${roomId}`);
    }
    return room;
  }

  private parseCellId(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Puzzle Race Grid expects payload.cellId");
    }

    return value;
  }

  private recordIgnoredMove(
    room: PuzzleRaceGridRoomState,
    playerId: string,
    seq: number,
    cellId: unknown
  ) {
    room.lastMove = {
      cellId: typeof cellId === "string" ? cellId : "unknown",
      playerId,
      pointsAwarded: 0,
      progressAfter: room.progressByPlayer[playerId] ?? 0,
      seq,
      selectedAt: new Date().toISOString(),
      status: "ignored"
    };
    this.bumpRevision(room);
  }

  private bumpRevision(room: PuzzleRaceGridRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}

function createCells(): PuzzleGridCell[] {
  return GRID_CELLS.map((cell) => ({
    ...cell,
    ownerPlayerId: null
  }));
}

function getLeader(scores: Record<string, number>) {
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  return ranked[0]?.[0] ?? null;
}
