import {
  launchContextSchema,
  type GameAdapter,
  type GameLaunchContext
} from "./contracts";

export const buildGameLaunchContext = (
  payload: GameLaunchContext
): GameLaunchContext => launchContextSchema.parse(payload);

export const createGameAdapterRegistry = (adapters: readonly GameAdapter[]) =>
  new Map(adapters.map((adapter) => [adapter.gameId, adapter]));
