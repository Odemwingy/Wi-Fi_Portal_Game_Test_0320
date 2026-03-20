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
import { parsePuzzleRaceGridState } from "./puzzle-race-grid-runtime-state";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

export function PuzzleRaceGridPackagePage() {
  const { launchContext } = usePackageLaunchContext("puzzle-race-grid");
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
            id: createClientId("puzzle-race-grid-activity"),
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
        appendActivity("success", "Grid puzzle 状态已更新", `revision ${message.payload.revision}`);
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
      appendActivity("success", "Puzzle Race Grid 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("puzzle-race-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("puzzle-race-state"),
          payload: { game_id: "puzzle-race-grid", room_id: launchContext.roomId },
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
      appendActivity("warn", "Puzzle Race Grid 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Puzzle Race Grid 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const gridState =
    gameState?.gameId === "puzzle-race-grid"
      ? parsePuzzleRaceGridState(gameState)
      : null;
  const currentPlayerScore = gridState?.scores[launchContext.passengerId] ?? 0;
  const currentPlayerProgress = gridState?.progressByPlayer[launchContext.passengerId] ?? 0;
  const currentPlayerNextTarget =
    gridState?.nextTargetByPlayer[launchContext.passengerId] ?? null;
  const currentPlayerIsWinner =
    gridState?.winnerPlayerIds.includes(launchContext.passengerId) ?? false;
  const canSelectCell =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !gridState?.isCompleted &&
    (gridState?.players.length ?? 0) >= 2;

  const rewardPoints = useMemo(() => {
    if (!gridState?.isCompleted) {
      return 0;
    }

    return currentPlayerIsWinner
      ? Math.max(16, currentPlayerScore + 4)
      : Math.max(8, currentPlayerScore);
  }, [currentPlayerIsWinner, currentPlayerScore, gridState]);

  useEffect(() => {
    if (!gridState?.isCompleted || !activeRoom) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      rewardPoints,
      gridState.winnerPlayerIds.join(","),
      currentPlayerProgress
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "puzzle-race-grid",
      metadata: {
        completed: currentPlayerIsWinner,
        completed_at: gridState.completedAtByPlayer[launchContext.passengerId],
        progress: currentPlayerProgress,
        target_count: gridState.targetCellIds.length,
        winner_player_ids: gridState.winnerPlayerIds
      },
      passenger_id: launchContext.passengerId,
      points: rewardPoints,
      reason: currentPlayerIsWinner
        ? "puzzle race grid winner completed"
        : "puzzle race grid participant completed",
      report_id: [
        "puzzle-race-grid",
        launchContext.passengerId,
        launchContext.sessionId,
        currentPlayerProgress
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
    currentPlayerProgress,
    gridState,
    launchContext.airlineCode,
    launchContext.passengerId,
    launchContext.sessionId,
    rewardPoints
  ]);

  function handleSelectCell(cellId: string) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("puzzle-race-event"),
        payload: {
          gameId: room.game_id,
          payload: { cellId },
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
    if (!gridState) {
      return "等待房间状态";
    }
    if (gridState.isCompleted) {
      return currentPlayerIsWinner ? "你已领先完成整条路径" : "对手已率先完成";
    }
    if (gridState.players.length < 2) {
      return "等待第二位乘客加入";
    }
    return currentPlayerNextTarget
      ? `当前目标 ${currentPlayerNextTarget}`
      : "等待下一步目标";
  })();

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Multiplayer Package</p>
          <h1>Puzzle Race Grid</h1>
          <p className="lede">
            双人网格竞速。两位乘客在同一张 4x4 网格上按各自的目标顺序抢答，
            谁先完成整条路径，谁就赢下这局 puzzle race。
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
              <span>Next Target</span>
              <strong>{currentPlayerNextTarget ?? "-"}</strong>
              <p>按顺序抢到目标格可推进进度。</p>
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
              当前进度 {currentPlayerProgress}/{gridState?.targetCellIds.length ?? 5}。
              目标格会按个人进度解锁，点错只会被忽略，不会重置。
            </p>
          </div>

          <div className="leaderboard-list">
            {(gridState?.players ?? []).map((playerId) => (
              <div className="leaderboard-row" key={playerId}>
                <div>
                  <strong>{playerId}</strong>
                  <p>
                    progress {gridState?.progressByPlayer[playerId] ?? 0}/
                    {gridState?.targetCellIds.length ?? 5}
                  </p>
                </div>
                <span>{gridState?.scores[playerId] ?? 0} pts</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Grid Board</p>
              <h2>网格选择区</h2>
            </div>
            <span className="pill-tag">async race</span>
          </div>

          <div className="quiz-options-grid">
            {(gridState?.cells ?? []).map((cell) => {
              const isOwnedByCurrentPlayer = cell.ownerPlayerId === launchContext.passengerId;
              const isOwnedByOpponent = !!cell.ownerPlayerId && !isOwnedByCurrentPlayer;
              const isCurrentTarget = cell.cellId === currentPlayerNextTarget;
              return (
                <button
                  className="quiz-option-card"
                  disabled={!canSelectCell || !!cell.ownerPlayerId}
                  key={cell.cellId}
                  onClick={() => {
                    handleSelectCell(cell.cellId);
                  }}
                  style={{
                    borderColor: isOwnedByCurrentPlayer
                      ? "rgba(115, 221, 179, 0.72)"
                      : isCurrentTarget
                        ? "rgba(245, 191, 66, 0.68)"
                        : undefined,
                    opacity: isOwnedByOpponent ? 0.7 : 1
                  }}
                  type="button"
                >
                  <span>{cell.cellId}</span>
                  <strong>{cell.value} pts</strong>
                  <p>
                    {cell.tone} / step {cell.targetIndex + 1}
                  </p>
                  <p>{cell.ownerPlayerId ? `owned by ${cell.ownerPlayerId}` : "available"}</p>
                </button>
              );
            })}
          </div>

          <div className="cabin-puzzle-summary">
            <article className="points-card">
              <span>Your Score</span>
              <strong>{currentPlayerScore}</strong>
              <p>抢到更高分的目标格能拉开领先优势。</p>
            </article>
            <article className="points-card">
              <span>Leader</span>
              <strong>{gridState?.currentLeaderPlayerId ?? "-"}</strong>
              <p>平台按当前累计分数同步领先者。</p>
            </article>
            <article className="points-card">
              <span>Auto Points</span>
              <strong>{gridState?.isCompleted ? rewardPoints : 0}</strong>
              <p>{isReportingPoints ? "比赛结束后正在自动上报积分" : "完赛后自动上报积分"}</p>
            </article>
          </div>

          <div className="launcher-meta-grid">
            {(gridState?.cells ?? [])
              .filter((cell) => cell.ownerPlayerId)
              .map((cell) => (
                <div className="quiz-meta-card" key={cell.cellId}>
                  <span>{cell.cellId}</span>
                  <strong>{cell.ownerPlayerId}</strong>
                  <p>
                    {cell.value} pts / {cell.tone}
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
