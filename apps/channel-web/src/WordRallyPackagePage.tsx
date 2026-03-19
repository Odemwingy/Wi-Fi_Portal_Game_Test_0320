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
import {
  readPackageLaunchContext,
  type PackageLaunchContext
} from "./package-launch-context";
import {
  WordRallyRuntimePanel
} from "./word-rally-runtime";
import {
  parseWordRallyState
} from "./word-rally-runtime-state";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

export function WordRallyPackagePage() {
  const [launchContext] = useState<PackageLaunchContext>(() =>
    readPackageLaunchContext(window.location.search)
  );
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

  const appendActivity = useEffectEvent(
    (tone: ActivityItem["tone"], summary: string, detail?: string) => {
      startTransition(() => {
        setActivity((current) => [
          {
            detail,
            id: createClientId("word-rally-activity"),
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
      case "game_event":
        appendActivity(
          "info",
          `${message.payload.playerId} 提交了实时事件`,
          JSON.stringify(message.payload.payload)
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
      appendActivity("success", "Word Rally 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("word-rally-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("word-rally-state"),
          payload: { game_id: "word-rally", room_id: launchContext.roomId },
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
      appendActivity("warn", "Word Rally 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Word Rally 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const wordRallyState =
    gameState?.gameId === "word-rally" ? parseWordRallyState(gameState) : null;
  const currentPlayerAnswer =
    wordRallyState?.answersByPlayer[launchContext.passengerId] ?? null;
  const currentPlayerPoints =
    wordRallyState?.scores[launchContext.passengerId] ?? 0;
  const canSubmitAnswer =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !wordRallyState?.isCompleted &&
    !currentPlayerAnswer;

  function handleSendWord(optionId: string) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("word-rally-event"),
        payload: {
          gameId: room.game_id,
          payload: { wordId: optionId },
          playerId: launchContext.passengerId,
          roomId: room.room_id,
          seq: playerEventSeqRef.current,
          type: "game_event"
        },
        type: "game_event"
      })
    );
  }

  async function handleReportPoints() {
    if (!wordRallyState?.isCompleted || isReportingPoints) {
      return;
    }

    setIsReportingPoints(true);

    try {
      const response = await reportPoints({
        game_id: "word-rally",
        metadata: {
          completed_round_count: wordRallyState.completedRoundCount,
          leading_players: wordRallyState.winningPlayerIds
        },
        passenger_id: launchContext.passengerId,
        points: Math.max(12, currentPlayerPoints + 6),
        reason: "word rally package completed",
        report_id: [
          "word-rally",
          launchContext.passengerId,
          launchContext.sessionId,
          currentPlayerPoints
        ].join(":"),
        session_id: launchContext.sessionId
      });

      setPointsSummary(response.summary);
      appendActivity("success", "积分已回传", `${response.summary.total_points} 总积分`);
    } finally {
      setIsReportingPoints(false);
    }
  }

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Iframe Game Package</p>
          <h1>Word Rally Package</h1>
          <p className="lede">
            这是第二个联机验证包。它复用统一房间、WebSocket 和积分链路，但用新的词汇回合玩法
            来验证多游戏接入不是只为 `quiz-duel` 定制。
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
              <p>room-scoped multiplayer launch</p>
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
              <p>seat {launchContext.seatNumber ?? "-"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Current Score</span>
              <strong>{currentPlayerPoints}</strong>
              <p>当前乘客在本局中的实时分数</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Room Sync</span>
              <strong>{isLoadingRoom ? "loading" : activeRoom?.status ?? "idle"}</strong>
              <p>{activeRoom?.players.length ?? 0} 位乘客在房内</p>
            </div>
          </div>

          <div className="launcher-actions">
            <button
              className="action-button action-button-primary"
              disabled={!wordRallyState?.isCompleted || isReportingPoints}
              onClick={() => {
                void handleReportPoints();
              }}
              type="button"
            >
              {isReportingPoints ? "回传中..." : "回传本局积分"}
            </button>
          </div>

          {apiError ? (
            <div className="panel-hint panel-hint-error">
              <strong>API / WS 错误</strong>
              <p>{apiError}</p>
            </div>
          ) : null}

          <div className="json-card">
            <p className="mini-label">launch query</p>
            <pre>{JSON.stringify(launchContext, null, 2)}</pre>
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Multiplayer Runtime</p>
              <h2>Word Rally</h2>
            </div>
            <span className="pill">{roomStatus}</span>
          </div>

          {wordRallyState ? (
            <WordRallyRuntimePanel
              activePlayerLabel={launchContext.passengerId}
              canSubmitAnswer={canSubmitAnswer}
              currentPlayerAnswer={currentPlayerAnswer}
              gameState={gameState}
              playerCount={activeRoom?.players.length ?? 1}
              showRawState
              state={wordRallyState}
              onSubmitAnswer={handleSendWord}
            />
          ) : (
            <div className="panel-hint">
              <strong>等待实时状态</strong>
              <p>连接房间后，Word Rally 的当前回合状态会显示在这里。</p>
            </div>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Realtime Activity</p>
            <h2>最近事件</h2>
          </div>
        </div>
        <div className="activity-feed">
          {activity.length === 0 ? (
            <div className="panel-hint">
              <strong>暂无事件</strong>
              <p>当房间快照、作答、ack 和 game state 到达后，这里会显示最近记录。</p>
            </div>
          ) : (
            activity.map((item) => (
              <article className={`activity-item activity-item-${item.tone}`} key={item.id}>
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
