import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
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
import { usePackageLaunchContext } from "./package-launch-context";
import { parseRouteBuilderDuelState } from "./route-builder-duel-runtime-state";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

export function RouteBuilderDuelPackagePage() {
  const { launchContext } = usePackageLaunchContext("route-builder-duel");
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
            id: createClientId("route-builder-activity"),
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
        appendActivity("success", "航路规划状态已更新", `revision ${message.payload.revision}`);
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
      appendActivity("success", "Route Builder Duel 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("route-builder-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("route-builder-state"),
          payload: { game_id: "route-builder-duel", room_id: launchContext.roomId },
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
      appendActivity("warn", "Route Builder Duel 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Route Builder Duel 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const routeState =
    gameState?.gameId === "route-builder-duel"
      ? parseRouteBuilderDuelState(gameState)
      : null;
  const currentPlayerScore = routeState?.scores[launchContext.passengerId] ?? 0;
  const currentPlayerMark = routeState?.playerMarks[launchContext.passengerId] ?? null;
  const currentPlayerIsWinner =
    routeState?.winnerPlayerIds.includes(launchContext.passengerId) ?? false;
  const canSelectLeg =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !routeState?.isCompleted &&
    routeState?.currentTurnPlayerId === launchContext.passengerId &&
    (routeState?.players.length ?? 0) >= 2;

  const rewardPoints = useMemo(() => {
    if (!routeState?.isCompleted) {
      return 0;
    }

    if (routeState.winnerPlayerIds.length === 0) {
      return Math.max(10, currentPlayerScore);
    }

    return currentPlayerIsWinner
      ? Math.max(14, currentPlayerScore + 4)
      : Math.max(8, currentPlayerScore);
  }, [currentPlayerIsWinner, currentPlayerScore, routeState]);

  useEffect(() => {
    if (!routeState?.isCompleted || !activeRoom) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      rewardPoints,
      routeState.winnerPlayerIds.join(","),
      routeState.availableLegCount
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "route-builder-duel",
      metadata: {
        claimed_leg_count: routeState.legs.filter(
          (leg) => leg.ownerPlayerId === launchContext.passengerId
        ).length,
        player_mark: currentPlayerMark,
        score: currentPlayerScore,
        winner_player_ids: routeState.winnerPlayerIds
      },
      passenger_id: launchContext.passengerId,
      points: rewardPoints,
      reason: currentPlayerIsWinner
        ? "route builder duel winner completed"
        : "route builder duel match completed",
      report_id: [
        "route-builder-duel",
        launchContext.passengerId,
        launchContext.sessionId,
        routeState.legs.length - routeState.availableLegCount
      ].join(":"),
      session_id: launchContext.sessionId
    })
      .then((response) => {
        setPointsSummary(response.summary);
        appendActivity("success", "积分已回传", `${response.summary.total_points} total`);
      })
      .finally(() => {
        setIsReportingPoints(false);
      });
  }, [
    activeRoom,
    appendActivity,
    currentPlayerIsWinner,
    currentPlayerMark,
    currentPlayerScore,
    launchContext.airlineCode,
    launchContext.passengerId,
    launchContext.sessionId,
    rewardPoints,
    routeState
  ]);

  function handleSelectLeg(legId: string) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("route-builder-event"),
        payload: {
          gameId: room.game_id,
          payload: { legId },
          playerId: launchContext.passengerId,
          roomId: room.room_id,
          seq: playerEventSeqRef.current,
          type: "game_event"
        },
        type: "game_event"
      })
    );
  }

  const statusLabel = (() => {
    if (!routeState) {
      return "等待房间状态";
    }
    if (routeState.isCompleted) {
      return routeState.winnerPlayerIds.length === 0 ? "平局结束" : "航路规划完成";
    }
    if (routeState.players.length < 2) {
      return "等待第二位乘客加入";
    }
    return routeState.currentTurnPlayerId === launchContext.passengerId
      ? "轮到你选择下一段航路"
      : `等待 ${routeState.currentTurnPlayerId}`;
  })();

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Multiplayer Package</p>
          <h1>Route Builder Duel</h1>
          <p className="lede">
            双人 turn-based 航路规划。两位乘客轮流选择下一段航线，争取连成更稳定、
            更高分的航路组合，用 lane combo 和基础分赢下这场轻策略对局。
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
              <p className="panel-kicker">Match Context</p>
              <h2>房间与乘客上下文</h2>
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
              <span>Invite Room</span>
              <strong>{launchContext.roomId ?? "-"}</strong>
              <p>{activeRoom?.room_name ?? "awaiting room load"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Your Mark</span>
              <strong>{currentPlayerMark ?? "-"}</strong>
              <p>{launchContext.airlineCode} / {launchContext.cabinClass}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.summary.total_points ?? 0}</strong>
              <p>latest points wallet total</p>
            </div>
          </div>

          {apiError ? <p className="error-text">{apiError}</p> : null}
          {isLoadingRoom ? <p className="muted-text">房间加载中...</p> : null}

          <div className="status-banner">
            <strong>{statusLabel}</strong>
            <p>
              已选择 {routeState ? routeState.legs.length - routeState.availableLegCount : 0}/
              {routeState?.legs.length ?? 6} 段航路。lane 相同的连续构建可获得额外 combo 分。
            </p>
          </div>

          <div className="leaderboard-list">
            {(routeState?.players ?? []).map((playerId) => (
              <div className="leaderboard-row" key={playerId}>
                <div>
                  <strong>{playerId}</strong>
                  <p>mark {routeState?.playerMarks[playerId] ?? "-"}</p>
                </div>
                <span>{routeState?.scores[playerId] ?? 0} pts</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Route Deck</p>
              <h2>航段选择区</h2>
            </div>
            <span className="pill-tag">turn-based</span>
          </div>

          <div className="quiz-options-grid">
            {(routeState?.legs ?? []).map((leg) => {
              const isClaimed = !!leg.ownerPlayerId;
              const isOwnedByCurrentPlayer = leg.ownerPlayerId === launchContext.passengerId;
              return (
                <button
                  className="quiz-option-card"
                  disabled={!canSelectLeg || isClaimed}
                  key={leg.legId}
                  onClick={() => {
                    handleSelectLeg(leg.legId);
                  }}
                  style={{
                    borderColor: isOwnedByCurrentPlayer
                      ? "rgba(115, 221, 179, 0.72)"
                      : isClaimed
                        ? "rgba(148, 163, 184, 0.32)"
                        : undefined,
                    opacity: isClaimed && !isOwnedByCurrentPlayer ? 0.72 : 1
                  }}
                  type="button"
                >
                  <span>{leg.fromLabel}</span>
                  <strong>{leg.toLabel}</strong>
                  <p>
                    {leg.lane} lane / base {leg.baseScore}
                  </p>
                  <p>{leg.ownerPlayerId ? `owned by ${leg.ownerPlayerId}` : "available"}</p>
                </button>
              );
            })}
          </div>

          <div className="cabin-puzzle-summary">
            <article className="points-card">
              <span>Your Score</span>
              <strong>{currentPlayerScore}</strong>
              <p>lane combo 会在同 lane 再次选中时额外 +1。</p>
            </article>
            <article className="points-card">
              <span>Last Move</span>
              <strong>{routeState?.lastMove?.legId ?? "-"}</strong>
              <p>
                {routeState?.lastMove
                  ? `${routeState.lastMove.playerId} +${routeState.lastMove.pointsAwarded}`
                  : "waiting for first route pick"}
              </p>
            </article>
            <article className="points-card">
              <span>Auto Points</span>
              <strong>{routeState?.isCompleted ? rewardPoints : 0}</strong>
              <p>{isReportingPoints ? "比赛结束后正在自动上报积分" : "完赛后自动上报积分"}</p>
            </article>
          </div>

          <div className="launcher-meta-grid">
            {(routeState?.moves ?? []).map((move) => (
              <div className="quiz-meta-card" key={`${move.legId}-${move.seq}`}>
                <span>{move.legId}</span>
                <strong>{move.playerId}</strong>
                <p>
                  +{move.pointsAwarded} / combo {move.comboBonus} / {move.lane}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Match Feed</p>
              <h2>实时动态</h2>
            </div>
            <span className="pill-tag">{activity.length} events</span>
          </div>

          <div className="activity-feed">
            {activity.length === 0 ? (
              <p className="muted-text">等待房间和 WS 事件...</p>
            ) : (
              activity.map((entry) => (
                <article className={`activity-item activity-${entry.tone}`} key={entry.id}>
                  <div>
                    <strong>{entry.summary}</strong>
                    <p>{entry.detail ?? "no detail"}</p>
                  </div>
                  <span>{entry.timestamp}</span>
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
