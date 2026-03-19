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
  QuizDuelRuntimePanel
} from "./quiz-duel-runtime";
import {
  parseQuizDuelState,
  type QuizChoice
} from "./quiz-duel-runtime-state";
import {
  readPackageLaunchContext,
  type PackageLaunchContext
} from "./package-launch-context";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

export function QuizDuelPackagePage() {
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
            id: createClientId("pkg-activity"),
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
      appendActivity("success", "Package 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("pkg-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("pkg-state"),
          payload: { game_id: "quiz-duel", room_id: launchContext.roomId },
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
      appendActivity("warn", "Package 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Package 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const quizDuelState =
    gameState?.gameId === "quiz-duel" ? parseQuizDuelState(gameState) : null;
  const currentPlayerAnswer =
    quizDuelState?.answersByPlayer[launchContext.passengerId] ?? null;
  const currentPlayerPoints =
    quizDuelState?.scores[launchContext.passengerId] ?? 0;
  const canSubmitAnswer =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !quizDuelState?.isCompleted &&
    !currentPlayerAnswer;

  function handleSendQuizAnswer(choice: QuizChoice) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("pkg-event"),
        payload: {
          gameId: room.game_id,
          payload: { answer: choice },
          playerId: launchContext.passengerId,
          roomId: room.room_id,
          seq: playerEventSeqRef.current,
          type: "game_event"
        },
        type: "game_event"
      })
    );

    appendActivity("info", `已发送答案 ${choice}`, `seq ${playerEventSeqRef.current}`);
  }

  async function handleReportPoints() {
    if (!quizDuelState?.isCompleted) {
      return;
    }

    setIsReportingPoints(true);
    setApiError(null);

    try {
      const response = await reportPoints({
        airline_code: launchContext.airlineCode,
        game_id: "quiz-duel",
        metadata: {
          completed_rounds: quizDuelState.completedRoundCount,
          winning_player_ids: quizDuelState.winningPlayerIds
        },
        passenger_id: launchContext.passengerId,
        points: currentPlayerPoints,
        reason: "quiz duel package completed",
        report_id: [
          "quiz-duel",
          launchContext.roomId ?? "no-room",
          launchContext.passengerId,
          currentPlayerPoints,
          quizDuelState.completedRoundCount
        ].join(":"),
        room_id: launchContext.roomId ?? undefined,
        session_id: launchContext.sessionId
      });

      setPointsSummary(response.summary);
      appendActivity(
        "success",
        "积分已回传到平台",
        `${response.summary.total_points} total points`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Report points failed";
      setApiError(detail);
      appendActivity("error", "积分回传失败", detail);
    } finally {
      setIsReportingPoints(false);
    }
  }

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Embedded Game Package</p>
          <h1>Quiz Duel Package Runtime</h1>
          <p className="lede">
            这是由 launcher 直接拉起的独立 package 页面，使用 launch query、房间状态和 WebSocket
            实时协议运行。
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
            <strong>{launchContext.roomId ?? "未绑定"}</strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Realtime</span>
            <strong>{roomStatus}</strong>
          </article>
        </div>
      </section>

      {apiError ? (
        <section className="banner banner-error">
          <strong>请求失败</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="package-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Launch Context</p>
              <h2>启动上下文</h2>
            </div>
            <a className="action-button" href="/">
              返回频道页
            </a>
          </div>

          <div className="launcher-meta-grid">
            <div className="quiz-meta-card">
              <span>Trace</span>
              <strong>{launchContext.traceId}</strong>
              <p>从 launcher 传入</p>
            </div>
            <div className="quiz-meta-card">
              <span>Locale</span>
              <strong>{launchContext.locale}</strong>
              <p>
                {launchContext.airlineCode} / {launchContext.cabinClass}
              </p>
            </div>
            <div className="quiz-meta-card">
              <span>Seat</span>
              <strong>{launchContext.seatNumber ?? "-"}</strong>
              <p>session {launchContext.sessionId}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Room Load</span>
              <strong>{isLoadingRoom ? "loading" : activeRoom?.status ?? "idle"}</strong>
              <p>{activeRoom?.room_name ?? "等待房间快照"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Quiz Reward</span>
              <strong>{currentPlayerPoints}</strong>
              <p>本局结束后可回传到平台</p>
            </div>
          </div>

          <div className="launcher-actions">
            <button
              className="action-button action-button-primary"
              disabled={!quizDuelState?.isCompleted || isReportingPoints}
              onClick={() => {
                void handleReportPoints();
              }}
              type="button"
            >
              {isReportingPoints ? "回传中..." : "回传本局积分"}
            </button>
          </div>

          <div className="json-card">
            <p className="mini-label">launch query</p>
            <pre>{JSON.stringify(launchContext, null, 2)}</pre>
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Game Runtime</p>
              <h2>独立 Package 视图</h2>
            </div>
            <span className={`status-pill status-${roomStatus}`}>{roomStatus}</span>
          </div>

          {quizDuelState ? (
            <QuizDuelRuntimePanel
              activePlayerLabel={launchContext.passengerId}
              canSubmitAnswer={canSubmitAnswer}
              currentPlayerAnswer={currentPlayerAnswer}
              gameState={gameState}
              onSubmitAnswer={handleSendQuizAnswer}
              playerCount={activeRoom?.players.length ?? 0}
              showRawState
              state={quizDuelState}
            />
          ) : (
            <div className="empty-state compact">
              <h3>等待 Quiz Duel runtime</h3>
              <p>
                {launchContext.roomId
                  ? "已收到 launch 上下文，等待房间快照和 game_state。"
                  : "当前 launch URL 没有 room_id，暂时无法进入联机局。"}
              </p>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Package Feed</p>
              <h2>独立事件流</h2>
            </div>
          </div>

          <div className="activity-list">
            {activity.length === 0 ? (
              <div className="empty-state compact">
                <h3>暂无事件</h3>
                <p>页面建立连接后，这里会记录 room 和 realtime 反馈。</p>
              </div>
            ) : (
              activity.map((item) => (
                <article className={`activity-item tone-${item.tone}`} key={item.id}>
                  <div className="activity-topline">
                    <strong>{item.summary}</strong>
                    <span>{item.timestamp}</span>
                  </div>
                  {item.detail ? <p>{item.detail}</p> : null}
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
