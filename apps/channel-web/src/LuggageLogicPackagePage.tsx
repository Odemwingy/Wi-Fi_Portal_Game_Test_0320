import { useEffect, useMemo, useState } from "react";

import {
  apiBaseUrl,
  getPassengerPointsSummary,
  reportPoints
} from "./channel-api";
import { usePackageLaunchContext } from "./package-launch-context";

type LuggageLane = "fragile" | "priority" | "standard";

type LuggageCard = {
  accent: "amber" | "mint" | "rose" | "sea";
  id: string;
  label: string;
  note: string;
  targetLane: LuggageLane;
};

type LuggageResolution = {
  cardId: string;
  chosenLane: LuggageLane;
  correct: boolean;
  targetLane: LuggageLane;
};

type GameStage = "briefing" | "playing" | "completed";

const LUGGAGE_CARDS: LuggageCard[] = [
  {
    accent: "sea",
    id: "carry-on-lite",
    label: "Carry-on Lite",
    note: "Cabin safe, no special handling.",
    targetLane: "standard"
  },
  {
    accent: "rose",
    id: "glass-sampler",
    label: "Glass Sampler",
    note: "Handle gently through the sorting line.",
    targetLane: "fragile"
  },
  {
    accent: "amber",
    id: "status-gold-case",
    label: "Gold Status Case",
    note: "Fast-track connection on arrival.",
    targetLane: "priority"
  },
  {
    accent: "mint",
    id: "weekend-roller",
    label: "Weekend Roller",
    note: "Standard tagged cabin transfer.",
    targetLane: "standard"
  },
  {
    accent: "rose",
    id: "camera-crate",
    label: "Camera Crate",
    note: "Sensitive contents, avoid rough handling.",
    targetLane: "fragile"
  },
  {
    accent: "amber",
    id: "biz-overnight",
    label: "Business Overnight",
    note: "Needs quickest reclaim at destination.",
    targetLane: "priority"
  }
];

const LANE_LABELS: Record<LuggageLane, string> = {
  fragile: "Fragile",
  priority: "Priority",
  standard: "Standard"
};

export function LuggageLogicPackagePage() {
  const { launchContext } = usePackageLaunchContext("luggage-logic");
  const [stage, setStage] = useState<GameStage>("briefing");
  const [cardIndex, setCardIndex] = useState(0);
  const [resolutions, setResolutions] = useState<LuggageResolution[]>([]);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const currentCard = LUGGAGE_CARDS[cardIndex] ?? null;
  const correctCount = useMemo(
    () => resolutions.filter((resolution) => resolution.correct).length,
    [resolutions]
  );
  const accuracy = useMemo(() => {
    if (resolutions.length === 0) {
      return 0;
    }

    return Math.round((correctCount / resolutions.length) * 100);
  }, [correctCount, resolutions.length]);
  const logicPoints = useMemo(
    () => Math.max(10, correctCount * 10 + (accuracy >= 80 ? 8 : 0)),
    [accuracy, correctCount]
  );

  useEffect(() => {
    void getPassengerPointsSummary(launchContext.passengerId)
      .then((summary) => {
        setPointsSummary(summary);
      })
      .catch(() => {
        // Keep package UI usable even if summary fetch fails.
      });
  }, [launchContext.passengerId]);

  function handleStart() {
    setStage("playing");
    setCardIndex(0);
    setResolutions([]);
  }

  function handleSort(chosenLane: LuggageLane) {
    if (!currentCard || stage !== "playing") {
      return;
    }

    const correct = chosenLane === currentCard.targetLane;
    const nextResolutions = [
      ...resolutions,
      {
        cardId: currentCard.id,
        chosenLane,
        correct,
        targetLane: currentCard.targetLane
      }
    ];

    setResolutions(nextResolutions);

    if (cardIndex + 1 >= LUGGAGE_CARDS.length) {
      setStage("completed");
      return;
    }

    setCardIndex((current) => current + 1);
  }

  async function handleReportPoints() {
    if (stage !== "completed") {
      return;
    }

    setIsReportingPoints(true);

    try {
      const response = await reportPoints({
        airline_code: launchContext.airlineCode,
        game_id: "luggage-logic",
        metadata: {
          accuracy,
          cards_completed: resolutions.length,
          correct_count: correctCount
        },
        passenger_id: launchContext.passengerId,
        points: logicPoints,
        reason: "luggage logic package completed",
        report_id: [
          "luggage-logic",
          launchContext.passengerId,
          launchContext.sessionId,
          logicPoints
        ].join(":"),
        session_id: launchContext.sessionId
      });

      setPointsSummary(response.summary);
    } finally {
      setIsReportingPoints(false);
    }
  }

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Iframe Game Package</p>
          <h1>Luggage Logic Package</h1>
          <p className="lede">
            单机箱包排序短局。你需要根据箱包标签和说明，把每件行李送进正确的处理通道，
            用最少失误完成整轮分拣。
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
            <span>Seat</span>
            <strong>{launchContext.seatNumber ?? "-"}</strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Stage</span>
            <strong>{stage}</strong>
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
              <p>room_id {launchContext.roomId ?? "not required"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Accuracy</span>
              <strong>{accuracy}%</strong>
              <p>
                {correctCount}/{resolutions.length || LUGGAGE_CARDS.length} cards correct
              </p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Logic Reward</span>
              <strong>{logicPoints}</strong>
              <p>完成后可回传的建议积分</p>
            </div>
          </div>

          <div className="launcher-actions">
            {stage === "briefing" ? (
              <button
                className="action-button action-button-primary"
                onClick={handleStart}
                type="button"
              >
                开始 Luggage Logic
              </button>
            ) : (
              <button className="action-button" onClick={handleStart} type="button">
                重新开局
              </button>
            )}
            <button
              className="action-button action-button-primary"
              disabled={stage !== "completed" || isReportingPoints}
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
              <p className="panel-kicker">Single Player Runtime</p>
              <h2>Luggage Logic</h2>
            </div>
            <div className="activity-topline">
              <span>6 张行李卡</span>
              <span>3 条分拣通道</span>
            </div>
          </div>

          <section className="quiz-stage">
            <div className="quiz-header">
              <div>
                <p className="mini-label">Sorting Card</p>
                <h3>{currentCard?.label ?? "分拣完成"}</h3>
                <p className="quiz-roundline">
                  {stage === "completed"
                    ? `Final ${LUGGAGE_CARDS.length}/${LUGGAGE_CARDS.length}`
                    : `Card ${Math.min(cardIndex + 1, LUGGAGE_CARDS.length)}/${LUGGAGE_CARDS.length}`}
                  <span>{correctCount} 张已正确分拣</span>
                </p>
              </div>
              <span
                className={`status-pill ${
                  stage === "completed" ? "status-connected" : "status-connecting"
                }`}
              >
                {stage === "briefing"
                  ? "等待开局"
                  : stage === "playing"
                    ? "分拣进行中"
                    : "本局已结束"}
              </span>
            </div>

            <p className="quiz-body">
              {currentCard?.note ?? "所有行李都已完成分拣，可以回传本局积分。"}
            </p>

            <div className="choice-grid">
              {(Object.keys(LANE_LABELS) as LuggageLane[]).map((laneId) => (
                <button
                  className="choice-button"
                  disabled={stage !== "playing" || !currentCard}
                  key={laneId}
                  onClick={() => handleSort(laneId)}
                  type="button"
                >
                  <span className="choice-label">{laneId.toUpperCase()}</span>
                  <strong>{LANE_LABELS[laneId]}</strong>
                  <small>
                    {laneId === "standard"
                      ? "普通处理"
                      : laneId === "priority"
                        ? "优先提取"
                        : "易碎保护"}
                  </small>
                </button>
              ))}
            </div>

            <div className="quiz-meta-grid">
              <div className="quiz-meta-card">
                <span>当前乘客</span>
                <strong>{launchContext.passengerId}</strong>
                <p>room 不必需，直接从 launcher 启动</p>
              </div>
              <div className="quiz-meta-card">
                <span>剩余卡片</span>
                <strong>{Math.max(0, LUGGAGE_CARDS.length - resolutions.length)}</strong>
                <p>完成全部 6 张后进入结算</p>
              </div>
              <div className="quiz-meta-card">
                <span>建议积分</span>
                <strong>{logicPoints}</strong>
                <p>准确率达到 80% 会获得额外奖励</p>
              </div>
            </div>
          </section>

          {resolutions.length > 0 ? (
            <div className="round-history">
              {resolutions
                .slice()
                .reverse()
                .map((resolution) => (
                  <article className="round-history-card" key={resolution.cardId}>
                    <div className="round-history-topline">
                      <strong>{resolution.cardId}</strong>
                      <span>{resolution.correct ? "correct" : "missed"}</span>
                    </div>
                    <p>
                      {LANE_LABELS[resolution.chosenLane]}
                      {" -> "}
                      目标 {LANE_LABELS[resolution.targetLane]}
                    </p>
                  </article>
                ))}
            </div>
          ) : null}
        </article>
      </section>
    </main>
  );
}
