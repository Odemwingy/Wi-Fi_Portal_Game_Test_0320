import { z } from "zod";

import { eventEnvelopeSchema, gameStateSnapshotSchema } from "./contracts";

export const roomStatusValues = [
  "waiting",
  "ready",
  "in_progress",
  "completed",
  "abandoned"
] as const;

export const playerConnectionValues = ["connected", "disconnected"] as const;
export const realtimeClientMessageTypeValues = [
  "game_event",
  "game_state_request",
  "room_presence",
  "room_snapshot_request"
] as const;
export const realtimeServerMessageTypeValues = [
  "ack",
  "error",
  "game_event",
  "game_state",
  "room_presence",
  "room_snapshot"
] as const;

export const createRoomRequestSchema = z.object({
  game_id: z.string().min(1),
  host_player_id: z.string().min(1),
  host_session_id: z.string().min(1),
  room_name: z.string().min(1).max(64),
  max_players: z.number().int().min(2).max(8).default(2)
});

export const joinRoomRequestSchema = z.object({
  room_id: z.string().min(1),
  player_id: z.string().min(1),
  session_id: z.string().min(1)
});

export const joinRoomByInviteRequestSchema = z.object({
  invite_code: z.string().trim().min(4).max(8),
  player_id: z.string().min(1),
  session_id: z.string().min(1)
});

export const leaveRoomRequestSchema = z.object({
  room_id: z.string().min(1),
  player_id: z.string().min(1)
});

export const setReadyRequestSchema = z.object({
  room_id: z.string().min(1),
  player_id: z.string().min(1),
  ready: z.boolean()
});

export const reconnectPlayerRequestSchema = z.object({
  room_id: z.string().min(1),
  player_id: z.string().min(1),
  session_id: z.string().min(1)
});

export const roomPlayerSchema = z.object({
  player_id: z.string().min(1),
  session_id: z.string().min(1),
  is_host: z.boolean(),
  ready: z.boolean(),
  connection_status: z.enum(playerConnectionValues),
  disconnected_at: z.string().nullable(),
  reconnect_deadline_at: z.string().nullable()
});

export const roomSnapshotSchema = z.object({
  room_id: z.string().min(1),
  room_name: z.string().min(1),
  game_id: z.string().min(1),
  host_player_id: z.string().min(1),
  status: z.enum(roomStatusValues),
  invite_code: z.string().min(4),
  max_players: z.number().int().min(2).max(8),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  players: z.array(roomPlayerSchema),
  reconnect_window_seconds: z.number().int().nonnegative()
});

export const roomActionResponseSchema = z.object({
  trace_id: z.string().min(1),
  room: roomSnapshotSchema
});

export const realtimeHandshakeSchema = z.object({
  protocol: z.literal("websocket"),
  endpoint: z.string().startsWith("/"),
  required_query: z.array(z.string().min(1)),
  supported_message_types: z.array(z.string().min(1))
});

export const realtimeConnectionQuerySchema = z.object({
  trace_id: z.string().min(1),
  room_id: z.string().min(1),
  player_id: z.string().min(1),
  session_id: z.string().min(1)
});

export const roomPresenceClientPayloadSchema = z.object({
  room_id: z.string().min(1),
  player_id: z.string().min(1),
  status: z.enum(playerConnectionValues)
});

export const roomPresenceBroadcastPayloadSchema = z.object({
  room_id: z.string().min(1),
  player_id: z.string().min(1),
  status: z.enum(playerConnectionValues),
  connected_players: z.number().int().nonnegative()
});

export const roomSnapshotRequestPayloadSchema = z.object({
  room_id: z.string().min(1)
});

export const gameStateRequestPayloadSchema = z.object({
  game_id: z.string().min(1),
  room_id: z.string().min(1)
});

export const realtimeAckPayloadSchema = z.object({
  acked_type: z.string().min(1)
});

export const realtimeErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

const realtimeClientMessageBaseSchema = z.object({
  message_id: z.string().min(1)
});

export const realtimeClientMessageSchema = z.discriminatedUnion("type", [
  realtimeClientMessageBaseSchema.extend({
    type: z.literal("game_event"),
    payload: eventEnvelopeSchema
  }),
  realtimeClientMessageBaseSchema.extend({
    type: z.literal("game_state_request"),
    payload: gameStateRequestPayloadSchema
  }),
  realtimeClientMessageBaseSchema.extend({
    type: z.literal("room_presence"),
    payload: roomPresenceClientPayloadSchema
  }),
  realtimeClientMessageBaseSchema.extend({
    type: z.literal("room_snapshot_request"),
    payload: roomSnapshotRequestPayloadSchema
  })
]);

const realtimeServerMessageBaseSchema = z.object({
  message_id: z.string().min(1),
  correlation_id: z.string().min(1).nullable(),
  trace_id: z.string().min(1),
  room_id: z.string().min(1),
  sent_at: z.string().min(1)
});

export const realtimeServerMessageSchema = z.discriminatedUnion("type", [
  realtimeServerMessageBaseSchema.extend({
    type: z.literal("ack"),
    payload: realtimeAckPayloadSchema
  }),
  realtimeServerMessageBaseSchema.extend({
    type: z.literal("error"),
    payload: realtimeErrorPayloadSchema
  }),
  realtimeServerMessageBaseSchema.extend({
    type: z.literal("game_event"),
    payload: eventEnvelopeSchema
  }),
  realtimeServerMessageBaseSchema.extend({
    type: z.literal("game_state"),
    payload: gameStateSnapshotSchema
  }),
  realtimeServerMessageBaseSchema.extend({
    type: z.literal("room_presence"),
    payload: roomPresenceBroadcastPayloadSchema
  }),
  realtimeServerMessageBaseSchema.extend({
    type: z.literal("room_snapshot"),
    payload: roomSnapshotSchema
  })
]);

export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;
export type JoinRoomByInviteRequest = z.infer<
  typeof joinRoomByInviteRequestSchema
>;
export type LeaveRoomRequest = z.infer<typeof leaveRoomRequestSchema>;
export type SetReadyRequest = z.infer<typeof setReadyRequestSchema>;
export type ReconnectPlayerRequest = z.infer<typeof reconnectPlayerRequestSchema>;
export type RoomPlayer = z.infer<typeof roomPlayerSchema>;
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type RoomActionResponse = z.infer<typeof roomActionResponseSchema>;
export type RealtimeHandshake = z.infer<typeof realtimeHandshakeSchema>;
export type RealtimeConnectionQuery = z.infer<typeof realtimeConnectionQuerySchema>;
export type RoomPresenceClientPayload = z.infer<
  typeof roomPresenceClientPayloadSchema
>;
export type RoomPresenceBroadcastPayload = z.infer<
  typeof roomPresenceBroadcastPayloadSchema
>;
export type RoomSnapshotRequestPayload = z.infer<
  typeof roomSnapshotRequestPayloadSchema
>;
export type GameStateRequestPayload = z.infer<typeof gameStateRequestPayloadSchema>;
export type RealtimeAckPayload = z.infer<typeof realtimeAckPayloadSchema>;
export type RealtimeErrorPayload = z.infer<typeof realtimeErrorPayloadSchema>;
export type RealtimeClientMessage = z.infer<typeof realtimeClientMessageSchema>;
export type RealtimeServerMessage = z.infer<typeof realtimeServerMessageSchema>;
