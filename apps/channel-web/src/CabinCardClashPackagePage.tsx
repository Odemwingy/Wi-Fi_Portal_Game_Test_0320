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
import { parseCabinCardClashState } from "./cabin-card-clash-runtime-state";
import { usePackageLaunchContext } from "./package-launch-context";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

export function CabinCardClashPackagePage() {
  const { launchContext } = usePackageLaunchContext("cabin-card-clash");
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
            id: createClientId("card-clash-activity"),
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
        appendActivity("success", "已收到最新牌局", `revision ${message.payload.revision}`);
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
      appendActivity("success", "Cabin Card Clash 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("card-clash-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("card-clash-state"),
          payload: { game_id: "cabin-card-clash", room_id: launchContext.roomId },
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
      appendActivity("warn", "Cabin Card Clash 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Cabin Card Clash 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const clashState =
    gameState?.gameId === "cabin-card-clash"
      ? parseCabinCardClashState(gameState)
      : null;
  const currentPlayerCards = clashState?.handsByPlayer[launchContext.passengerId] ?? [];
  const currentPlayerPlayedCardIds =
    clashState?.playedCardIdsByPlayer[launchContext.passengerId] ?? [];
  const currentPlayerIsWinner =
    clashState?.winnerPlayerIds.includes(launchContext.passengerId) ?? false;
  const canPlayCard =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !clashState?.isCompleted &&
    clashState?.currentTurnPlayerId === launchContext.passengerId &&
    (clashState?.players.length ?? 0) >= 2;

  const rewardPoints = useMemo(() => {
    if (!clashState?.isCompleted) {
      return 0;
    }
    if (currentPlayerIsWinner) {
      return 18;
    }
    if (clashState.winnerPlayerIds.length === 0) {
      return 10;
    }
    return 8;
  }, [clashState, currentPlayerIsWinner]);

  useEffect(() => {
    if (!clashState?.isCompleted || !activeRoom) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      rewardPoints,
      clashState.winnerPlayerIds.join(","),
      clashState.roundResults.length
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "cabin-card-clash",
      metadata: {
        round_count: clashState.roundResults.length,
        total_rounds: clashState.totalRounds,
        winner_player_ids: clashState.winnerPlayerIds
      },
      passenger_id: launchContext.passengerId,
      points: rewardPoints,
      reason:
        clashState.winnerPlayerIds.length === 0
          ? "cabin card clash draw completed"
          : currentPlayerIsWinner
            ? "cabin card clash winner completed"
            : "cabin card clash participant completed",
      report_id: [
        "cabin-card-clash",
        launchContext.passengerId,
        launchContext.sessionId,
        clashState.roundResults.length
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
    clashState,
    currentPlayerIsWinner,
    launchContext.airlineCode,
    launchContext.passengerId,
    launchContext.sessionId,
    rewardPoints
  ]);

  function handlePlayCard(cardId: string) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("card-clash-event"),
        payload: {
          gameId: room.game_id,
          payload: { cardId },
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
    if (!clashState) {
      return "等待牌局状态";
    }
    if (clashState.isCompleted) {
      return clashState.winnerPlayerIds.length === 0 ? "平局结束" : "对战结束";
    }
    if (clashState.players.length < 2) {
      return "等待第二位乘客加入";
    }
    return clashState.currentTurnPlayerId === launchContext.passengerId ? "轮到你出牌" : "等待对手出牌";
  })();

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Multiplayer Package</p>
          <h1>Cabin Card Clash</h1>
          <p className="lede">
            轻量双人回合制卡牌。两位乘客各持 4 张 cabin 卡牌，轮流出牌并比较 power，4 回合后按总分决出胜负。
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
            <span>Round</span>
            <strong>
              {clashState?.currentRoundNumber ?? 0}/{clashState?.totalRounds ?? 0}
            </strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Status</span>
            <strong>{statusLabel}</strong>
          </article>
        </div>
      </section>

      <section className="package-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Launch Context</p>
              <h2>牌局上下文</h2>
            </div>
            <a className="action-button" href="/">
              返回频道页
            </a>
          </div>

          <div className="launcher-meta-grid">
            <div className="quiz-meta-card">
              <span>Trace</span>
              <strong>{launchContext.traceId}</strong>
              <p>portal + package scope</p>
            </div>
            <div className="quiz-meta-card">
              <span>Room</span>
              <strong>{launchContext.roomId ?? "-"}</strong>
              <p>{isLoadingRoom ? "加载中" : activeRoom?.invite_code ?? "等待房间"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Your Score</span>
              <strong>{clashState?.scores[launchContext.passengerId] ?? 0}</strong>
              <p>{roomStatus}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Total Points</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Reward</span>
              <strong>{rewardPoints}</strong>
              <p>{isReportingPoints ? "本局积分回传中" : "完赛后自动回传"}</p>
            </div>
          </div>

          {apiError ? <p className="inline-error">{apiError}</p> : null}

          <div className="card-clash-layout">
            <section className="card-clash-board">
              <div className="panel-heading compact">
                <div>
                  <p className="panel-kicker">Current Round</p>
                  <h3>本回合已出牌</h3>
                </div>
              </div>
              <div className="card-clash-table">
                {(clashState?.players ?? []).map((playerId) => {
                  const play = clashState?.currentRoundCards[playerId] ?? null;
                  return (
                    <article key={playerId} className="card-clash-slot">
                      <span>{playerId}</span>
                      <strong>{play?.cardId ?? "Waiting"}</strong>
                      <p>{play ? `${play.suit} / power ${play.power}` : "尚未出牌"}</p>
                    </article>
                  );
                })}
              </div>

              <div className="card-clash-hand">
                {currentPlayerCards.map((card) => {
                  const isUsed = currentPlayerPlayedCardIds.includes(card.id);
                  return (
                    <button
                      key={card.id}
                      className={`card-option accent-${card.accent}${isUsed ? " is-used" : ""}`}
                      disabled={!canPlayCard || isUsed}
                      onClick={() => handlePlayCard(card.id)}
                      type="button"
                    >
                      <span>{card.suit}</span>
                      <strong>{card.label}</strong>
                      <p>Power {card.power}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="signal-sidebar">
              <div className="panel-heading compact">
                <div>
                  <p className="panel-kicker">Round Result</p>
                  <h3>最新结算</h3>
                </div>
              </div>
              <div className="signal-players">
                <article className="signal-player-card">
                  <strong>
                    {clashState?.lastRoundResult
                      ? `Round ${clashState.lastRoundResult.roundNumber}`
                      : "等待首回合"}
                  </strong>
                  <span>
                    {clashState?.lastRoundResult?.winnerPlayerIds.join(", ") || "未结算"}
                  </span>
                  <p>
                    {clashState?.lastRoundResult
                      ? clashState.lastRoundResult.winnerPlayerIds.length === 0
                        ? "双方平局，各得 1 分"
                        : "单回合胜者得 3 分"
                      : "两位乘客都出牌后自动结算"}
                  </p>
                </article>
                {(clashState?.players ?? []).map((playerId) => (
                  <article key={playerId} className="signal-player-card">
                    <strong>{playerId}</strong>
                    <span>{clashState?.scores[playerId] ?? 0} pts</span>
                    <p>
                      {clashState?.winnerPlayerIds.includes(playerId)
                        ? "当前领先 / 已完赛"
                        : clashState?.currentTurnPlayerId === playerId
                          ? "当前出牌方"
                          : "等待下个动作"}
                    </p>
                  </article>
                ))}
              </div>
            </aside>
          </div>
        </article>

        <aside className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Activity</p>
              <h2>实时事件流</h2>
            </div>
          </div>
          <div className="activity-feed">
            {activity.length === 0 ? (
              <p className="empty-state">等待房间和出牌事件流。</p>
            ) : (
              activity.map((entry) => (
                <article key={entry.id} className={`activity-item tone-${entry.tone}`}>
                  <div>
                    <strong>{entry.summary}</strong>
                    <span>{entry.timestamp}</span>
                  </div>
                  {entry.detail ? <p>{entry.detail}</p> : null}
                </article>
              ))
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
