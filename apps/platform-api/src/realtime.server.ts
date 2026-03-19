import type { IncomingMessage, Server as HttpServer } from "node:http";

import {
  realtimeClientMessageSchema,
  realtimeConnectionQuerySchema,
  realtimeServerMessageSchema,
  type GameStateSnapshot,
  type RealtimeClientMessage,
  type RealtimeServerMessage,
  type RoomSnapshot
} from "@wifi-portal/game-sdk";
import {
  createSpanId,
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

import {
  RoomService,
  type RoomSubscriptionEvent
} from "./room.service";
import { GameRuntimeService } from "./game-runtime.service";
import { PlatformMetricsService } from "./platform-metrics.service";

type ConnectedClient = {
  player_id: string;
  room_id: string;
  session_id: string;
  socket: WebSocket;
  trace_context: TraceContext;
};

const logger = createStructuredLogger("platform-api.realtime");
const POLICY_VIOLATION_CLOSE_CODE = 1008;
const WS_PATH = "/ws/game-room";

export class RealtimeServer {
  private readonly clientsByRoom = new Map<string, Set<ConnectedClient>>();
  private readonly clientsBySocket = new Map<WebSocket, ConnectedClient>();
  private readonly heartbeatTimer: NodeJS.Timeout;
  private readonly roomUnsubscribe: () => void;
  private readonly wsServer: WebSocketServer;
  private isClosed = false;

  constructor(
    server: HttpServer,
    private readonly roomService: RoomService,
    private readonly gameRuntimeService: GameRuntimeService,
    private readonly platformMetricsService: PlatformMetricsService
  ) {
    this.wsServer = new WebSocketServer({
      path: WS_PATH,
      server
    });
    this.roomUnsubscribe = this.roomService.subscribe((event) => {
      this.handleRoomEvent(event);
    });

    this.wsServer.on("connection", (socket, request) => {
      void this.handleConnection(socket, request);
    });
    this.wsServer.on("close", () => {
      this.cleanup();
    });
    this.heartbeatTimer = setInterval(() => {
      this.pingClients();
    }, 30_000);
  }

  close() {
    if (this.isClosed) {
      return;
    }
    this.cleanup();
    this.wsServer.close();
  }

  private cleanup() {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    clearInterval(this.heartbeatTimer);
    this.roomUnsubscribe();
    this.clientsByRoom.clear();
    this.clientsBySocket.clear();
  }

  private async handleConnection(socket: WebSocket, request: IncomingMessage) {
    const query = this.parseConnectionQuery(request.url);
    if (!query) {
      this.rejectConnection(socket, "INVALID_CONNECTION_QUERY", "Missing connection query");
      return;
    }

    const traceContext: TraceContext = {
      trace_id: query.trace_id,
      span_id: createSpanId(),
      parent_span_id: null
    };

    try {
      let room = (await this.roomService.getRoom(traceContext, query.room_id)).room;
      const player = room.players.find(
        (candidate) => candidate.player_id === query.player_id
      );

      if (!player) {
        this.rejectConnection(
          socket,
          "PLAYER_NOT_FOUND",
          "Player is not part of the room",
          traceContext,
          query.room_id
        );
        return;
      }

      if (player.connection_status === "disconnected") {
        room = (await this.roomService.reconnect(traceContext, {
          room_id: query.room_id,
          player_id: query.player_id,
          session_id: query.session_id
        })).room;
      } else if (player.session_id !== query.session_id) {
        this.rejectConnection(
          socket,
          "SESSION_MISMATCH",
          "Session id does not match the active room session",
          traceContext,
          query.room_id
        );
        return;
      }

      const client: ConnectedClient = {
        player_id: query.player_id,
        room_id: query.room_id,
        session_id: query.session_id,
        socket,
        trace_context: traceContext
      };

      this.registerClient(client);
      this.platformMetricsService.recordWsConnectionOpened();
      this.sendRoomSnapshot(client.socket, traceContext, room, null);
      const gameSnapshot = await this.gameRuntimeService.getGameSnapshot(
        traceContext,
        room.game_id,
        room.room_id
      );
      if (gameSnapshot) {
        this.sendGameState(client.socket, traceContext, room.room_id, gameSnapshot, null);
      }
      this.broadcastPresence(
        traceContext,
        room,
        query.player_id,
        "connected",
        query.player_id
      );

      socket.on("message", (raw) => {
        void this.handleMessage(client, raw);
      });
      socket.on("pong", (buffer) => {
        const sentAt = Number(buffer.toString());
        if (Number.isFinite(sentAt) && sentAt > 0) {
          this.platformMetricsService.recordWsRtt(Date.now() - sentAt);
        }
      });
      socket.on("close", () => {
        void this.handleSocketClose(client);
      });
      socket.on("error", (error) => {
        logger.error("realtime.socket_error", traceContext, {
          status: "error",
          error_detail: error.message,
          metadata: {
            player_id: client.player_id,
            room_id: client.room_id
          }
        });
      });

      logger.info("realtime.connected", traceContext, {
        output_summary: "websocket connection established",
        metadata: {
          player_id: client.player_id,
          room_id: client.room_id
        }
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown connection error";

      logger.error("realtime.connection_failed", traceContext, {
        status: "error",
        error_detail: detail,
        metadata: {
          player_id: query.player_id,
          room_id: query.room_id
        }
      });

      this.rejectConnection(
        socket,
        "CONNECTION_FAILED",
        detail,
        traceContext,
        query.room_id
      );
    }
  }

  private async handleMessage(client: ConnectedClient, raw: RawData) {
    const span = startChildSpan(client.trace_context);
    const inputSummary = raw.toString();

    try {
      const payload = JSON.parse(inputSummary) as unknown;
      const parsed = realtimeClientMessageSchema.safeParse(payload);

      if (!parsed.success) {
        this.sendError(
          client.socket,
          span,
          client.room_id,
          "INVALID_MESSAGE",
          parsed.error.message,
          null
        );
        return;
      }

      this.platformMetricsService.recordWsMessage("received", parsed.data.type);
      await this.dispatchMessage(client, span, parsed.data);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Unknown realtime message error";

      logger.error("realtime.message_failed", span, {
        status: "error",
        error_detail: detail,
        input_summary: inputSummary,
        metadata: {
          player_id: client.player_id,
          room_id: client.room_id
        }
      });

      this.sendError(
        client.socket,
        span,
        client.room_id,
        "MESSAGE_PROCESSING_FAILED",
        detail,
        null
      );
    }
  }

  private async handleSocketClose(client: ConnectedClient) {
    if (!this.clientsBySocket.has(client.socket)) {
      return;
    }

    const span = startChildSpan(client.trace_context);
    this.removeClient(client);
    this.platformMetricsService.recordWsConnectionClosed();

    try {
      await this.roomService.disconnect(span, client.room_id, client.player_id);
    } catch (error) {
      logger.warn("realtime.disconnect_ignored", span, {
        status: "error",
        error_detail:
          error instanceof Error ? error.message : "Unknown disconnect error",
        metadata: {
          player_id: client.player_id,
          room_id: client.room_id
        }
      });
      return;
    }

    logger.warn("realtime.closed", span, {
      metadata: {
        player_id: client.player_id,
        room_id: client.room_id
      },
      output_summary: "websocket connection closed"
    });
  }

  private async dispatchMessage(
    client: ConnectedClient,
    traceContext: TraceContext,
    message: RealtimeClientMessage
  ) {
    switch (message.type) {
      case "game_state_request": {
        if (
          message.payload.room_id !== client.room_id ||
          message.payload.game_id !==
            (await this.roomService.getRoom(traceContext, client.room_id)).room
              .game_id
        ) {
          this.sendError(
            client.socket,
            traceContext,
            client.room_id,
            "GAME_STATE_REQUEST_MISMATCH",
            "Game state request does not match the socket room or game",
            message.message_id
          );
          return;
        }

        const gameSnapshot = await this.gameRuntimeService.getGameSnapshot(
          traceContext,
          message.payload.game_id,
          message.payload.room_id
        );

        if (gameSnapshot) {
          this.sendGameState(
            client.socket,
            traceContext,
            client.room_id,
            gameSnapshot,
            message.message_id
          );
        }
        this.sendAck(
          client.socket,
          traceContext,
          client.room_id,
          message.message_id,
          "game_state_request"
        );
        return;
      }

      case "room_snapshot_request": {
        if (message.payload.room_id !== client.room_id) {
          this.sendError(
            client.socket,
            traceContext,
            client.room_id,
            "ROOM_MISMATCH",
            "Snapshot request room does not match socket room",
            message.message_id
          );
          return;
        }

        const room = (await this.roomService.getRoom(traceContext, client.room_id))
          .room;
        this.sendRoomSnapshot(
          client.socket,
          traceContext,
          room,
          message.message_id
        );
        this.sendAck(
          client.socket,
          traceContext,
          client.room_id,
          message.message_id,
          "room_snapshot_request"
        );
        return;
      }

      case "room_presence": {
        if (
          message.payload.room_id !== client.room_id ||
          message.payload.player_id !== client.player_id
        ) {
          this.sendError(
            client.socket,
            traceContext,
            client.room_id,
            "PLAYER_MISMATCH",
            "Presence payload does not match socket identity",
            message.message_id
          );
          return;
        }

        const room = (await this.roomService.getRoom(traceContext, client.room_id))
          .room;
        this.broadcastPresence(
          traceContext,
          room,
          client.player_id,
          message.payload.status,
          client.player_id
        );
        this.sendAck(
          client.socket,
          traceContext,
          client.room_id,
          message.message_id,
          "room_presence"
        );
        return;
      }

      case "game_event": {
        if (
          message.payload.roomId !== client.room_id ||
          message.payload.playerId !== client.player_id
        ) {
          this.sendError(
            client.socket,
            traceContext,
            client.room_id,
            "GAME_EVENT_MISMATCH",
            "Game event room or player does not match socket identity",
            message.message_id
          );
          return;
        }

        const gameSnapshot = await this.gameRuntimeService.handleGameEvent(
          traceContext,
          message.payload
        );

        this.broadcast(client.room_id, {
          correlation_id: message.message_id,
          payload: message.payload,
          room_id: client.room_id,
          sent_at: new Date().toISOString(),
          trace_id: traceContext.trace_id,
          type: "game_event"
        });
        if (gameSnapshot) {
          this.broadcastGameState(
            traceContext,
            client.room_id,
            gameSnapshot,
            message.message_id
          );
        }
        this.sendAck(
          client.socket,
          traceContext,
          client.room_id,
          message.message_id,
          "game_event"
        );
      }
    }
  }

  private handleRoomEvent(event: RoomSubscriptionEvent) {
    const traceContext: TraceContext = {
      trace_id: event.trace_id,
      span_id: createSpanId(),
      parent_span_id: null
    };

    this.broadcastRoomSnapshotToRoom(traceContext, event.room);

    if (
      event.actor_player_id &&
      (event.action === "room.joined" ||
        event.action === "room.left" ||
        event.action === "room.reconnected" ||
        event.action === "room.player_disconnected")
    ) {
      this.broadcastPresence(
        traceContext,
        event.room,
        event.actor_player_id,
        event.action === "room.player_disconnected"
          ? "disconnected"
          : "connected"
      );
    }
  }

  private registerClient(client: ConnectedClient) {
    const roomClients = this.clientsByRoom.get(client.room_id) ?? new Set();

    for (const existingClient of roomClients) {
      if (existingClient.player_id !== client.player_id) {
        continue;
      }

      this.removeClient(existingClient);
      existingClient.socket.close(
        POLICY_VIOLATION_CLOSE_CODE,
        "Replaced by a newer realtime connection"
      );
    }

    roomClients.add(client);
    this.clientsByRoom.set(client.room_id, roomClients);
    this.clientsBySocket.set(client.socket, client);
  }

  private removeClient(client: ConnectedClient) {
    const roomClients = this.clientsByRoom.get(client.room_id);
    if (!roomClients) {
      return;
    }

    roomClients.delete(client);
    this.clientsBySocket.delete(client.socket);

    if (roomClients.size === 0) {
      this.clientsByRoom.delete(client.room_id);
    }
  }

  private broadcastRoomSnapshotToRoom(
    traceContext: TraceContext,
    room: RoomSnapshot
  ) {
    this.broadcast(room.room_id, {
      correlation_id: null,
      payload: room,
      room_id: room.room_id,
      sent_at: new Date().toISOString(),
      trace_id: traceContext.trace_id,
      type: "room_snapshot"
    });
  }

  private sendRoomSnapshot(
    socket: WebSocket,
    traceContext: TraceContext,
    room: RoomSnapshot,
    correlationId: string | null
  ) {
    this.send(socket, {
      correlation_id: correlationId,
      payload: room,
      room_id: room.room_id,
      sent_at: new Date().toISOString(),
      trace_id: traceContext.trace_id,
      type: "room_snapshot"
    });
  }

  private broadcastGameState(
    traceContext: TraceContext,
    roomId: string,
    gameSnapshot: GameStateSnapshot,
    correlationId: string | null
  ) {
    this.broadcast(roomId, {
      correlation_id: correlationId,
      payload: gameSnapshot,
      room_id: roomId,
      sent_at: new Date().toISOString(),
      trace_id: traceContext.trace_id,
      type: "game_state"
    });
  }

  private sendGameState(
    socket: WebSocket,
    traceContext: TraceContext,
    roomId: string,
    gameSnapshot: GameStateSnapshot,
    correlationId: string | null
  ) {
    this.send(socket, {
      correlation_id: correlationId,
      payload: gameSnapshot,
      room_id: roomId,
      sent_at: new Date().toISOString(),
      trace_id: traceContext.trace_id,
      type: "game_state"
    });
  }

  private broadcastPresence(
    traceContext: TraceContext,
    room: RoomSnapshot,
    playerId: string,
    status: "connected" | "disconnected",
    targetPlayerId?: string
  ) {
    this.broadcast(room.room_id, {
      correlation_id: null,
      payload: {
        connected_players: room.players.filter(
          (player) => player.connection_status === "connected"
        ).length,
        player_id: playerId,
        room_id: room.room_id,
        status
      },
      room_id: room.room_id,
      sent_at: new Date().toISOString(),
      trace_id: traceContext.trace_id,
      type: "room_presence"
    }, targetPlayerId);
  }

  private sendAck(
    socket: WebSocket,
    traceContext: TraceContext,
    roomId: string,
    correlationId: string,
    ackedType: string
  ) {
    this.send(socket, {
      correlation_id: correlationId,
      payload: {
        acked_type: ackedType
      },
      room_id: roomId,
      sent_at: new Date().toISOString(),
      trace_id: traceContext.trace_id,
      type: "ack"
    });
  }

  private sendError(
    socket: WebSocket,
    traceContext: TraceContext,
    roomId: string,
    code: string,
    message: string,
    correlationId: string | null
  ) {
    this.send(socket, {
      correlation_id: correlationId,
      payload: {
        code,
        message
      },
      room_id: roomId,
      sent_at: new Date().toISOString(),
      trace_id: traceContext.trace_id,
      type: "error"
    });
  }

  private broadcast(
    roomId: string,
    message: Omit<RealtimeServerMessage, "message_id">,
    targetPlayerId?: string
  ) {
    const roomClients = this.clientsByRoom.get(roomId);
    if (!roomClients) {
      return;
    }

    for (const client of roomClients) {
      if (targetPlayerId && client.player_id !== targetPlayerId) {
        continue;
      }

      this.send(client.socket, message);
    }
  }

  private send(
    socket: WebSocket,
    message: Omit<RealtimeServerMessage, "message_id">
  ) {
    if (socket.readyState !== socket.OPEN) {
      return;
    }

    const parsed = realtimeServerMessageSchema.parse({
      ...message,
      message_id: this.createMessageId()
    });

    this.platformMetricsService.recordWsMessage("sent", parsed.type);
    socket.send(JSON.stringify(parsed));
  }

  private pingClients() {
    const heartbeatPayload = Buffer.from(`${Date.now()}`);

    for (const client of this.clientsBySocket.values()) {
      if (client.socket.readyState !== client.socket.OPEN) {
        continue;
      }

      client.socket.ping(heartbeatPayload);
    }
  }

  private rejectConnection(
    socket: WebSocket,
    code: string,
    message: string,
    traceContext?: TraceContext,
    roomId = "unknown"
  ) {
    if (traceContext) {
      this.sendError(socket, traceContext, roomId, code, message, null);
    }
    socket.close(POLICY_VIOLATION_CLOSE_CODE, message);
  }

  private parseConnectionQuery(urlValue: string | undefined) {
    if (!urlValue) {
      return null;
    }

    const url = new URL(urlValue, "http://localhost");
    if (url.pathname !== WS_PATH) {
      return null;
    }

    const parsed = realtimeConnectionQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    );

    return parsed.success ? parsed.data : null;
  }

  private createMessageId() {
    return `msg_${Math.random().toString(36).slice(2, 10)}`;
  }
}
