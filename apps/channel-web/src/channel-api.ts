import {
  channelContentStateSchema,
  passengerPointsSummarySchema,
  pointsLeaderboardResponseSchema,
  pointsReportResponseSchema,
  realtimeServerMessageSchema,
  rewardRedeemResponseSchema,
  rewardsCatalogResponseSchema,
  passengerRewardsWalletSchema,
  roomActionResponseSchema,
  roomSnapshotSchema,
  sessionBootstrapResponseSchema,
  type CreateRoomRequest,
  type ChannelContentState,
  type ChannelContentUpdateRequest,
  type PassengerPointsSummary,
  type PassengerRewardsWallet,
  type PointsLeaderboardResponse,
  type PointsReportRequest,
  type PointsReportResponse,
  type RealtimeConnectionQuery,
  type RealtimeServerMessage,
  type RewardRedeemRequest,
  type RewardRedeemResponse,
  type RewardsCatalogResponse,
  type RoomActionResponse,
  type RoomSnapshot,
  type SessionBootstrapRequest,
  type SessionBootstrapResponse,
  type SetReadyRequest
} from "@wifi-portal/game-sdk";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000/api";

export const apiBaseUrl =
  normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) ?? DEFAULT_API_BASE_URL;

const websocketBaseUrl =
  normalizeBaseUrl(import.meta.env.VITE_WS_BASE_URL) ??
  apiBaseUrl.replace(/^http/, "ws").replace(/\/api$/, "");

export async function bootstrapSession(
  payload: SessionBootstrapRequest
): Promise<SessionBootstrapResponse> {
  return requestJson(
    "/session/bootstrap",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    sessionBootstrapResponseSchema.parse
  );
}

export async function createRoom(
  payload: CreateRoomRequest
): Promise<RoomActionResponse> {
  return requestJson(
    "/lobby/create-room",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    roomActionResponseSchema.parse
  );
}

export async function getAdminChannelContent(payload: {
  airline_code: string;
  locale: string;
}): Promise<ChannelContentState> {
  const query = new URLSearchParams(payload);

  return requestJson(
    `/admin/channel/content?${query.toString()}`,
    {},
    channelContentStateSchema.parse
  );
}

export async function updateAdminChannelContent(
  payload: ChannelContentUpdateRequest
): Promise<ChannelContentState> {
  return requestJson(
    "/admin/channel/content",
    {
      body: JSON.stringify(payload),
      method: "PUT"
    },
    channelContentStateSchema.parse
  );
}

export async function joinRoom(payload: {
  room_id: string;
  player_id: string;
  session_id: string;
}): Promise<RoomActionResponse> {
  return requestJson(
    "/lobby/join-room",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    roomActionResponseSchema.parse
  );
}

export async function joinRoomByInvite(payload: {
  invite_code: string;
  player_id: string;
  session_id: string;
}): Promise<RoomActionResponse> {
  return requestJson(
    "/lobby/join-by-invite",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    roomActionResponseSchema.parse
  );
}

export async function setReady(
  payload: SetReadyRequest
): Promise<RoomActionResponse> {
  return requestJson(
    "/lobby/set-ready",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    roomActionResponseSchema.parse
  );
}

export async function getRoom(roomId: string): Promise<RoomSnapshot> {
  return requestJson(`/lobby/rooms/${roomId}`, {}, (value) =>
    roomSnapshotSchema.parse((value as { room: unknown }).room)
  );
}

export async function reportPoints(
  payload: PointsReportRequest
): Promise<PointsReportResponse> {
  return requestJson(
    "/points/report",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    pointsReportResponseSchema.parse
  );
}

export async function getPassengerPointsSummary(
  passengerId: string
): Promise<PassengerPointsSummary> {
  return requestJson(
    `/points/passengers/${passengerId}`,
    {},
    passengerPointsSummarySchema.parse
  );
}

export async function getPointsLeaderboard(
  limit = 8
): Promise<PointsLeaderboardResponse> {
  const query = new URLSearchParams({
    limit: String(limit)
  });

  return requestJson(
    `/points/leaderboard?${query.toString()}`,
    {},
    pointsLeaderboardResponseSchema.parse
  );
}

export async function getRewardsCatalog(payload: {
  airline_code: string;
  locale: string;
}): Promise<RewardsCatalogResponse> {
  const query = new URLSearchParams(payload);

  return requestJson(
    `/rewards/catalog?${query.toString()}`,
    {},
    rewardsCatalogResponseSchema.parse
  );
}

export async function getPassengerRewardsWallet(payload: {
  airline_code: string;
  passenger_id: string;
}): Promise<PassengerRewardsWallet> {
  const query = new URLSearchParams({
    airline_code: payload.airline_code
  });

  return requestJson(
    `/rewards/passengers/${payload.passenger_id}/wallet?${query.toString()}`,
    {},
    passengerRewardsWalletSchema.parse
  );
}

export async function redeemReward(
  payload: RewardRedeemRequest
): Promise<RewardRedeemResponse> {
  return requestJson(
    "/rewards/redeem",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    rewardRedeemResponseSchema.parse
  );
}

export function buildRealtimeUrl(query: RealtimeConnectionQuery) {
  const url = new URL("/ws/game-room", websocketBaseUrl);
  url.searchParams.set("trace_id", query.trace_id);
  url.searchParams.set("room_id", query.room_id);
  url.searchParams.set("player_id", query.player_id);
  url.searchParams.set("session_id", query.session_id);
  return url.toString();
}

export function isRealtimeOpen(socket: WebSocket | null) {
  return socket?.readyState === WebSocket.OPEN;
}

type JsonParser<T> = (value: unknown) => T;

async function requestJson<T>(
  path: string,
  init: RequestInit,
  parse: JsonParser<T>
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload) ?? `Request failed: ${response.status}`);
  }

  return parse(payload);
}

function normalizeBaseUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  return value.replace(/\/$/, "");
}

function readErrorMessage(payload: Record<string, unknown> | null) {
  if (!payload) {
    return null;
  }

  const message = payload.message;
  if (typeof message === "string") {
    return message;
  }

  return null;
}

export function parseRealtimeMessage(raw: string): RealtimeServerMessage {
  return realtimeServerMessageSchema.parse(JSON.parse(raw));
}
