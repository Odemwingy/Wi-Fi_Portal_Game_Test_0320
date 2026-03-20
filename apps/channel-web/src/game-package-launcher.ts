import type {
  ChannelCatalogEntry,
  GameLaunchContext,
  RoomSnapshot
} from "@wifi-portal/game-sdk";

export type GamePackageLaunchMode = "embedded" | "iframe";

export type GamePackageLaunchSpec = {
  capabilities: string[];
  displayName: string;
  gameId: string;
  mode: GamePackageLaunchMode;
  portalUrl: string;
  route: string;
  roomId: string | null;
  traceId: string;
  url: string;
};

const EMBEDDED_PACKAGE_IDS = new Set(["quiz-duel"]);

export function buildGamePackageLaunchSpec(input: {
  baseUrl: string;
  entry: ChannelCatalogEntry;
  launchContext: GameLaunchContext;
  room: RoomSnapshot | null;
  traceId: string;
}): GamePackageLaunchSpec {
  return {
    capabilities: [...input.entry.capabilities],
    displayName: input.entry.display_name,
    gameId: input.entry.game_id,
    mode: getGamePackageLaunchMode(input.entry.game_id),
    portalUrl: buildPortalHostUrl({
      baseUrl: input.baseUrl,
      gameId: input.entry.game_id,
      launchContext: input.launchContext,
      roomId: input.room?.room_id ?? null,
      route: input.entry.route,
      traceId: input.traceId
    }),
    route: input.entry.route,
    roomId: input.room?.room_id ?? null,
    traceId: input.traceId,
    url: buildGamePackageLaunchUrl({
      baseUrl: input.baseUrl,
      gameId: input.entry.game_id,
      launchContext: input.launchContext,
      roomId: input.room?.room_id ?? null,
      route: input.entry.route,
      traceId: input.traceId
    })
  };
}

export function buildGamePackageLaunchUrl(input: {
  baseUrl: string;
  gameId: string;
  launchContext: GameLaunchContext;
  roomId: string | null;
  route: string;
  traceId: string;
}) {
  const url = new URL(input.route, normalizeBaseUrl(input.baseUrl));

  url.searchParams.set("game_id", input.gameId);
  url.searchParams.set("trace_id", input.traceId);
  url.searchParams.set("airline_code", input.launchContext.airlineCode);
  url.searchParams.set("cabin_class", input.launchContext.cabinClass);
  url.searchParams.set("locale", input.launchContext.locale);
  url.searchParams.set("passenger_id", input.launchContext.passengerId);
  url.searchParams.set("session_id", input.launchContext.sessionId);

  if (input.launchContext.seatNumber) {
    url.searchParams.set("seat_number", input.launchContext.seatNumber);
  }

  if (input.roomId) {
    url.searchParams.set("room_id", input.roomId);
  }

  return url.toString();
}

export function getGamePackageLaunchMode(gameId: string): GamePackageLaunchMode {
  return EMBEDDED_PACKAGE_IDS.has(gameId) ? "embedded" : "iframe";
}

export function buildPortalHostUrl(input: {
  baseUrl: string;
  gameId: string;
  launchContext: GameLaunchContext;
  roomId: string | null;
  route: string;
  traceId: string;
}) {
  const url = new URL("/portal/host", normalizeBaseUrl(input.baseUrl));

  url.searchParams.set("game_id", input.gameId);
  url.searchParams.set("route", input.route);
  url.searchParams.set("trace_id", input.traceId);
  url.searchParams.set("airline_code", input.launchContext.airlineCode);
  url.searchParams.set("cabin_class", input.launchContext.cabinClass);
  url.searchParams.set("locale", input.launchContext.locale);
  url.searchParams.set("passenger_id", input.launchContext.passengerId);
  url.searchParams.set("session_id", input.launchContext.sessionId);

  if (input.launchContext.seatNumber) {
    url.searchParams.set("seat_number", input.launchContext.seatNumber);
  }

  if (input.roomId) {
    url.searchParams.set("room_id", input.roomId);
  }

  return url.toString();
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
