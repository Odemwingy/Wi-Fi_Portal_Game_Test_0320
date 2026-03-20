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
import {
  parseTapBeatBattleState,
  type TapBeatLaneId
} from "./tap-beat-battle-runtime-state";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

const LANE_ACTIONS: Array<{
  accent: "amber" | "mint" | "rose";
  id: TapBeatLaneId;
  label: string;
}> = [
  { accent: "amber", id: "left", label: "Left Beat" },
  { accent: "mint", id: "center", label: "Center Beat" },
  { accent: "rose", id: "right", label: "Right Beat" }
];

export function TapBeatBattlePackagePage() {
  const { launchContext } = usePackageLaunchContext("tap-beat-battle");
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
            id: createClientId("tap-beat-activity"),
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
        appendActivity("success", "节奏战局已更新", `revision ${message.payload.revision}`);
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
      appendActivity("success", "Tap Beat Battle 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("tap-beat-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("tap-beat-state"),
          payload: { game_id: "tap-beat-battle", room_id: launchContext.roomId },
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
      appendActivity("warn", "Tap Beat Battle 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Tap Beat Battle 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const beatState =
    gameState?.gameId === "tap-beat-battle"
      ? parseTapBeatBattleState(gameState)
      : null;
  const currentPlayerScore = beatState?.scores[launchContext.passengerId] ?? 0;
  const currentPlayerProgress = beatState?.progressByPlayer[launchContext.passengerId] ?? 0;
  const currentPlayerNextCue = beatState?.nextCueByPlayer[launchContext.passengerId] ?? null;
  const currentPlayerRoundScore = beatState?.roundScoresByPlayer[launchContext.passengerId] ?? 0;
  const currentPlayerIsWinner =
    beatState?.winnerPlayerIds.includes(launchContext.passengerId) ?? false;
  const canTap =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !beatState?.isCompleted &&
    (beatState?.players.length ?? 0) >= 2 &&
    !!currentPlayerNextCue;

  const rewardPoints = useMemo(() => {
    if (!beatState?.isCompleted) {
      return 0;
    }

    return currentPlayerIsWinner
      ? Math.max(18, currentPlayerScore + 4)
      : Math.max(8, currentPlayerScore);
  }, [beatState, currentPlayerIsWinner, currentPlayerScore]);

  useEffect(() => {
    if (!beatState?.isCompleted || !activeRoom) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      rewardPoints,
      beatState.winnerPlayerIds.join(","),
      currentPlayerScore
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "tap-beat-battle",
      metadata: {
        current_round_number: beatState.currentRoundNumber,
        total_rounds: beatState.totalRounds,
        winner_player_ids: beatState.winnerPlayerIds
      },
      passenger_id: launchContext.passengerId,
      points: rewardPoints,
      reason: currentPlayerIsWinner
        ? "tap beat battle winner completed"
        : "tap beat battle participant completed",
      report_id: [
        "tap-beat-battle",
        launchContext.passengerId,
        launchContext.sessionId,
        currentPlayerScore
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
    beatState,
    currentPlayerIsWinner,
    currentPlayerScore,
    launchContext.airlineCode,
    launchContext.passengerId,
    launchContext.sessionId,
    rewardPoints
  ]);

  function handleTap(laneId: TapBeatLaneId) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("tap-beat-event"),
        payload: {
          gameId: room.game_id,
          payload: { laneId },
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
    if (!beatState) {
      return "等待房间状态";
    }
    if (beatState.isCompleted) {
      return beatState.winnerPlayerIds.length === 0 ? "本局结束" : "对拍已结束";
    }
    if (beatState.players.length < 2) {
      return "等待第二位乘客加入";
    }
    return currentPlayerNextCue
      ? `下一拍 ${currentPlayerNextCue.label}`
      : "等待本轮结算";
  })();

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Multiplayer Package</p>
          <h1>Tap Beat Battle</h1>
          <p className="lede">
            双人视觉节奏对拍。双方按各自 beat pattern 依次点击左右中三条节奏轨道，
            每轮 4 拍，按正确节奏累计分数并结算胜负。
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
              {beatState?.currentRoundNumber ?? 1}/{beatState?.totalRounds ?? 0}
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
              <h2>节奏对拍上下文</h2>
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
              <strong>{currentPlayerScore}</strong>
              <p>{roomStatus}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Round Score</span>
              <strong>{currentPlayerRoundScore}</strong>
              <p>
                {currentPlayerProgress}/{beatState?.currentPattern.length ?? 0} 已提交
              </p>
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

          {apiError ? (
            <div className="status-banner status-error">
              <span>错误</span>
              <strong>{apiError}</strong>
            </div>
          ) : null}

          <div className="json-card">
            <p className="mini-label">current pattern</p>
            <pre>{JSON.stringify(beatState?.currentPattern ?? [], null, 2)}</pre>
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Beat Sequence</p>
              <h2>Visual Tempo Duel</h2>
            </div>
            <div className="activity-topline">
              <span>低频同步</span>
              <span>每轮 4 拍</span>
            </div>
          </div>

          <section className="quiz-stage">
            <div className="quiz-header">
              <div>
                <p className="mini-label">Pattern</p>
                <h3>Follow the lane sequence</h3>
                <p className="quiz-roundline">
                  {beatState?.isCompleted
                    ? `Final ${beatState.totalRounds}/${beatState.totalRounds}`
                    : `Round ${beatState?.currentRoundNumber ?? 1}/${beatState?.totalRounds ?? 0}`}
                  <span>{beatState?.completedRoundCount ?? 0} 轮已结算</span>
                </p>
              </div>
              <span
                className={`status-pill ${
                  beatState?.isCompleted ? "status-connected" : "status-connecting"
                }`}
              >
                {statusLabel}
              </span>
            </div>

            <div className="choice-grid">
              {(beatState?.currentPattern ?? []).map((cue, index) => (
                <div
                  className={`choice-button ${index === currentPlayerProgress ? "choice-button-selected" : ""}`}
                  key={cue.id}
                >
                  <span className="choice-label">{index + 1}</span>
                  <strong>{cue.label}</strong>
                  <small>
                    {cue.laneId} · {cue.points} pts
                  </small>
                </div>
              ))}
            </div>

            <div className="choice-grid">
              {LANE_ACTIONS.map((lane) => (
                <button
                  className="choice-button"
                  disabled={!canTap}
                  key={lane.id}
                  onClick={() => handleTap(lane.id)}
                  type="button"
                >
                  <span className="choice-label">{lane.id.toUpperCase()}</span>
                  <strong>{lane.label}</strong>
                  <small>{lane.accent} lane</small>
                </button>
              ))}
            </div>

            <div className="quiz-meta-grid">
              <div className="quiz-meta-card">
                <span>当前乘客</span>
                <strong>{launchContext.passengerId}</strong>
                <p>
                  {currentPlayerNextCue
                    ? `下一拍应点 ${currentPlayerNextCue.laneId}`
                    : beatState?.isCompleted
                      ? "本局已结束"
                      : "等待本轮结算"}
                </p>
              </div>
              <div className="quiz-meta-card">
                <span>上一拍结果</span>
                <strong>{beatState?.lastAction?.status ?? "-"}</strong>
                <p>
                  {beatState?.lastAction
                    ? `${beatState.lastAction.playerId} · ${beatState.lastAction.laneId} · ${beatState.lastAction.pointsAwarded} pts`
                    : "尚无输入"}
                </p>
              </div>
              <div className="quiz-meta-card">
                <span>上一轮胜者</span>
                <strong>
                  {beatState?.lastCompletedRound?.winnerPlayerIds.join(", ") || "尚未揭晓"}
                </strong>
                <p>每轮按 round score 结算</p>
              </div>
            </div>
          </section>

          <div className="signal-layout">
            <div className="signal-sidebar">
              <div className="scoreboard">
                {Object.entries(beatState?.scores ?? {}).map(([playerId, score]) => (
                  <article className="score-row" key={playerId}>
                    <strong>{playerId}</strong>
                    <span>
                      {score} pts
                      {beatState?.winnerPlayerIds.includes(playerId) ? " · 胜者" : ""}
                    </span>
                  </article>
                ))}
              </div>

              <div className="activity-list">
                {activity.map((item) => (
                  <article className={`activity-item tone-${item.tone}`} key={item.id}>
                    <div className="activity-topline">
                      <strong>{item.summary}</strong>
                      <span>{item.timestamp}</span>
                    </div>
                    {item.detail ? <p>{item.detail}</p> : null}
                  </article>
                ))}
              </div>
            </div>

            {beatState?.roundHistory.length ? (
              <div className="round-history">
                {beatState.roundHistory.map((round) => (
                  <article className="round-history-card" key={round.roundNumber}>
                    <div className="round-history-topline">
                      <strong>Round {round.roundNumber}</strong>
                      <span>{round.winnerPlayerIds.join(", ") || "draw"}</span>
                    </div>
                    <p>
                      {round.pattern.map((cue) => cue.laneId).join(" -> ")}
                    </p>
                    <div className="scoreboard">
                      {Object.entries(round.roundScores).map(([playerId, score]) => (
                        <div className="score-chip" key={`${round.roundNumber}-${playerId}`}>
                          <span>{playerId}</span>
                          <strong>{score}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
