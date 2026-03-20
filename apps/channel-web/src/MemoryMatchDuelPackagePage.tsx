import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";

import type {
  GameStateSnapshot,
  RealtimeServerMessage,
  RoomSnapshot
} from "@wifi-portal/game-sdk";

import {
  apiBaseUrl,
  buildRealtimeUrl,
  getPassengerPointsSummary,
  getRoom,
  isRealtimeOpen,
  parseRealtimeMessage,
  reportPoints
} from "./channel-api";
import { MemoryMatchRuntimePanel } from "./memory-match-runtime";
import { parseMemoryMatchState } from "./memory-match-runtime-state";
import {
  usePackageLaunchContext
} from "./package-launch-context";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

export function MemoryMatchDuelPackagePage() {
  const { launchContext } = usePackageLaunchContext("memory-match-duel");
  const [activeRoom, setActiveRoom] = useState<RoomSnapshot | null>(null);
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("idle");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const playerEventSeqRef = useRef(0);
  const lastReportedSignatureRef = useRef<string | null>(null);

  const appendActivity = useEffectEvent(
    (tone: ActivityItem["tone"], summary: string, detail?: string) => {
      startTransition(() => {
        setActivity((current) => [
          {
            detail,
            id: createClientId("memory-match-activity"),
            summary,
            timestamp: new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            }),
            tone
          },
          ...current
        ].slice(0, 10));
      });
    }
  );

  const syncRoom = useEffectEvent((room: RoomSnapshot) => {
    startTransition(() => {
      setActiveRoom(room);
    });
  });

  const handleRealtimeMessage = useEffectEvent((message: RealtimeServerMessage) => {
    switch (message.type) {
      case "room_snapshot":
        syncRoom(message.payload);
        appendActivity("success", "房间快照已更新", message.payload.room_name);
        return;
      case "game_state":
        startTransition(() => {
          setGameState(message.payload);
        });
        appendActivity("success", "已收到最新游戏状态", `revision ${message.payload.revision}`);
        return;
      case "room_presence":
        appendActivity(
          message.payload.status === "connected" ? "info" : "warn",
          `${message.payload.player_id} ${message.payload.status === "connected" ? "已联机" : "已离线"}`
        );
        return;
      case "ack":
        appendActivity("info", `已确认 ${message.payload.acked_type}`);
        return;
      case "error":
        setApiError(message.payload.message);
        appendActivity("error", message.payload.code, message.payload.message);
    }
  });

  useEffect(() => {
    void getPassengerPointsSummary(launchContext.passengerId)
      .then((summary) => {
        setPointsSummary(summary);
      })
      .catch(() => {
        // Keep package UI functional even if summary fetch fails.
      });
  }, [launchContext.passengerId]);

  useEffect(() => {
    if (!launchContext.roomId) {
      return;
    }

    setIsLoadingRoom(true);
    setApiError(null);

    void getRoom(launchContext.roomId)
      .then((room) => {
        syncRoom(room);
        appendActivity("success", "已加载房间", room.room_name);
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : "Load room failed";
        setApiError(detail);
        appendActivity("error", "加载房间失败", detail);
      })
      .finally(() => {
        setIsLoadingRoom(false);
      });
  }, [appendActivity, launchContext.roomId, syncRoom]);

  useEffect(() => {
    if (!launchContext.roomId) {
      setRoomStatus("idle");
      return;
    }

    setRoomStatus("connecting");

    const socket = new WebSocket(
      buildRealtimeUrl({
        player_id: launchContext.passengerId,
        room_id: launchContext.roomId,
        session_id: launchContext.sessionId,
        trace_id: launchContext.traceId
      })
    );

    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setRoomStatus("connected");
      appendActivity("success", "Memory Match 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("memory-match-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("memory-match-state"),
          payload: { game_id: "memory-match-duel", room_id: launchContext.roomId },
          type: "game_state_request"
        })
      );
    });

    socket.addEventListener("message", (event) => {
      try {
        handleRealtimeMessage(parseRealtimeMessage(String(event.data)));
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "Unknown realtime payload error";
        setApiError(detail);
        appendActivity("error", "实时消息解析失败", detail);
      }
    });

    socket.addEventListener("close", () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setRoomStatus("idle");
      appendActivity("warn", "Memory Match 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Memory Match 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const memoryState =
    gameState?.gameId === "memory-match-duel"
      ? parseMemoryMatchState(gameState)
      : null;
  const playerCount = activeRoom?.players.length ?? 0;
  const currentPlayerPoints = memoryState?.scores[launchContext.passengerId] ?? 0;
  const canFlipCard =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !memoryState?.isCompleted &&
    memoryState?.currentTurnPlayerId === launchContext.passengerId &&
    (memoryState.selectionOwnerPlayerId === null ||
      memoryState.selectionOwnerPlayerId === launchContext.passengerId);

  useEffect(() => {
    if (!memoryState?.isCompleted) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      currentPlayerPoints,
      memoryState.revision
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "memory-match-duel",
      metadata: {
        matched_pair_count: memoryState.matchedPairCount,
        total_pairs: memoryState.totalPairs,
        winning_player_ids: memoryState.winningPlayerIds
      },
      passenger_id: launchContext.passengerId,
      points: Math.max(10, currentPlayerPoints),
      reason: "memory match duel completed",
      report_id: [
        "memory-match-duel",
        launchContext.passengerId,
        launchContext.sessionId,
        memoryState.revision
      ].join(":"),
      session_id: launchContext.sessionId
    })
      .then((response) => {
        setPointsSummary(response.summary);
        appendActivity("success", "积分已回传", `${response.summary.total_points} total`);
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : "Points report failed";
        setApiError(detail);
        appendActivity("error", "积分回传失败", detail);
      })
      .finally(() => {
        setIsReportingPoints(false);
      });
  }, [
    appendActivity,
    launchContext.airlineCode,
    currentPlayerPoints,
    launchContext.passengerId,
    launchContext.sessionId,
    memoryState
  ]);

  function handleFlipCard(cardIndex: number) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("memory-match-event"),
        payload: {
          gameId: room.game_id,
          payload: { cardIndex },
          playerId: launchContext.passengerId,
          roomId: room.room_id,
          seq: playerEventSeqRef.current,
          type: "game_event"
        },
        type: "game_event"
      })
    );
  }

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Embedded Multiplayer Package</p>
          <h1>Memory Match Duel Package</h1>
          <p className="lede">
            这个 package 用来验证 Wave A 的第 3 种联机玩法。它复用邀请码房间、统一 WS
            协议和积分链路，但把实时事件换成翻牌配对。
          </p>
        </div>
        <div className="hero-stats">
          <article className="stat-chip accent-sun">
            <span>API</span>
            <strong>{apiBaseUrl}</strong>
          </article>
          <article className="stat-chip accent-sea">
            <span>Passenger</span>
            <strong>{launchContext.passengerId}</strong>
          </article>
          <article className="stat-chip accent-mint">
            <span>Room</span>
            <strong>{launchContext.roomId ?? "-"}</strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Status</span>
            <strong>{roomStatus}</strong>
          </article>
        </div>
      </section>

      <section className="package-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Launch Context</p>
              <h2>Package 上下文</h2>
            </div>
            <a className="action-button" href="/">
              返回频道页
            </a>
          </div>

          <div className="launcher-meta-grid">
            <div className="quiz-meta-card">
              <span>Trace</span>
              <strong>{launchContext.traceId}</strong>
              <p>session-scoped package launch</p>
            </div>
            <div className="quiz-meta-card">
              <span>Locale</span>
              <strong>{launchContext.locale}</strong>
              <p>
                {launchContext.airlineCode} / {launchContext.cabinClass}
              </p>
            </div>
            <div className="quiz-meta-card">
              <span>Session</span>
              <strong>{launchContext.sessionId}</strong>
              <p>invite-room multiplayer package</p>
            </div>
            <div className="quiz-meta-card">
              <span>Room Load</span>
              <strong>{isLoadingRoom ? "loading" : activeRoom ? "ready" : "idle"}</strong>
              <p>{apiError ?? "房间与实时状态已接入"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Runtime Points</span>
              <strong>{currentPlayerPoints}</strong>
              <p>{isReportingPoints ? "已触发自动回传" : "本局实时积分"}</p>
            </div>
          </div>

          <div className="json-card">
            <p className="mini-label">launch query</p>
            <pre>{JSON.stringify(launchContext, null, 2)}</pre>
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Multiplayer Runtime</p>
              <h2>Memory Match Duel</h2>
            </div>
            <span className="pill">
              {memoryState
                ? `${memoryState.matchedPairCount}/${memoryState.totalPairs} matched`
                : roomStatus}
            </span>
          </div>

          {memoryState ? (
            <MemoryMatchRuntimePanel
              activePlayerLabel={launchContext.passengerId}
              canFlipCard={Boolean(canFlipCard)}
              gameState={gameState}
              playerCount={playerCount}
              state={memoryState}
              onFlipCard={handleFlipCard}
            />
          ) : (
            <div className="panel-hint">
              <strong>等待游戏状态</strong>
              <p>连接建立后会自动拉取房间快照和当前棋盘状态。</p>
            </div>
          )}
        </article>
      </section>

      <section className="activity-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Runtime Activity</p>
            <h2>最近事件</h2>
          </div>
          <span className="pill">{activity.length} items</span>
        </div>
        <div className="activity-list">
          {activity.length === 0 ? (
            <p className="empty-copy">连接建立后，这里会显示实时事件、结算和错误信息。</p>
          ) : (
            activity.map((item) => (
              <article className={`activity-item tone-${item.tone}`} key={item.id}>
                <div>
                  <strong>{item.summary}</strong>
                  {item.detail ? <p>{item.detail}</p> : null}
                </div>
                <time>{item.timestamp}</time>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
