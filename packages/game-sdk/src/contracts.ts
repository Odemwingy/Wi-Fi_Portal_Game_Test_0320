import { z } from "zod";

export const gameCapabilityValues = [
  "single-player",
  "multiplayer",
  "leaderboard",
  "invite-code",
  "points-reporting"
] as const;

export type GameCapability = (typeof gameCapabilityValues)[number];

export const launchContextSchema = z.object({
  airlineCode: z.string().min(2),
  cabinClass: z.string().min(1),
  locale: z.string().min(2),
  passengerId: z.string().min(1),
  sessionId: z.string().min(1),
  seatNumber: z.string().optional()
});

export type GameLaunchContext = z.infer<typeof launchContextSchema>;

export const eventEnvelopeSchema = z.object({
  type: z.literal("game_event"),
  gameId: z.string().min(1),
  roomId: z.string().min(1),
  playerId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  payload: z.record(z.unknown())
});

export type GameEventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const gameStateSnapshotSchema = z.object({
  gameId: z.string().min(1),
  roomId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
  state: z.record(z.unknown())
});

export type GameStateSnapshot = z.infer<typeof gameStateSnapshotSchema>;

export interface GameAdapter {
  readonly gameId: string;
  createMatch(roomId: string, hostPlayerId: string): Promise<void>;
  joinMatch(roomId: string, playerId: string): Promise<void>;
  handlePlayerAction(event: GameEventEnvelope): Promise<void>;
  getSnapshot(roomId: string): Promise<GameStateSnapshot>;
  reconnectPlayer(roomId: string, playerId: string): Promise<void>;
  finishMatch(roomId: string): Promise<void>;
}
