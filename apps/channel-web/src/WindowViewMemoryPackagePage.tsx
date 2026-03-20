import { useEffect, useMemo, useState } from "react";

import {
  apiBaseUrl,
  getPassengerPointsSummary,
  reportPoints
} from "./channel-api";
import { usePackageLaunchContext } from "./package-launch-context";

type ScenicTone = "amber" | "mint" | "rose" | "sea";

type ScenicCard = {
  id: string;
  label: string;
  note: string;
  seatLabel: string;
  tone: ScenicTone;
};

type MemoryRound = {
  cards: ScenicCard[];
  id: string;
  prompt: string;
  targetCardId: string;
};

type RoundAnswer = {
  correct: boolean;
  roundId: string;
  selectedCardId: string;
};

type GameStage = "briefing" | "memorize" | "recall" | "completed";

const MEMORY_ROUNDS: MemoryRound[] = [
  {
    cards: [
      {
        id: "sunrise-coast",
        label: "Sunrise Coast",
        note: "Orange light cutting across the wing tip.",
        seatLabel: "Window A",
        tone: "amber"
      },
      {
        id: "cloud-river",
        label: "Cloud River",
        note: "Thin silver trail over layered cloud banks.",
        seatLabel: "Window B",
        tone: "sea"
      },
      {
        id: "night-grid",
        label: "Night Grid",
        note: "City lights forming a neat landing pattern.",
        seatLabel: "Window C",
        tone: "rose"
      }
    ],
    id: "window-memory-01",
    prompt: "Which view was parked at Window B?",
    targetCardId: "cloud-river"
  },
  {
    cards: [
      {
        id: "snow-ridge",
        label: "Snow Ridge",
        note: "Sharp white peaks along a blue horizon.",
        seatLabel: "Window A",
        tone: "mint"
      },
      {
        id: "aurora-strip",
        label: "Aurora Strip",
        note: "Green bands fading behind the engine line.",
        seatLabel: "Window B",
        tone: "sea"
      },
      {
        id: "island-chain",
        label: "Island Chain",
        note: "Small islands stepping through a bright bay.",
        seatLabel: "Window C",
        tone: "amber"
      }
    ],
    id: "window-memory-02",
    prompt: "Which scene appeared at Window C?",
    targetCardId: "island-chain"
  },
  {
    cards: [
      {
        id: "storm-gap",
        label: "Storm Gap",
        note: "Dark cloud shelf with one bright opening.",
        seatLabel: "Window A",
        tone: "rose"
      },
      {
        id: "desert-line",
        label: "Desert Line",
        note: "Sand ridge and runway markers in soft haze.",
        seatLabel: "Window B",
        tone: "amber"
      },
      {
        id: "moon-water",
        label: "Moon Water",
        note: "Silver reflection stretching across the sea.",
        seatLabel: "Window C",
        tone: "sea"
      }
    ],
    id: "window-memory-03",
    prompt: "Which view belonged to Window A?",
    targetCardId: "storm-gap"
  },
  {
    cards: [
      {
        id: "rainbow-bank",
        label: "Rainbow Bank",
        note: "Brief color band along the upper cloud edge.",
        seatLabel: "Window A",
        tone: "mint"
      },
      {
        id: "harbor-turn",
        label: "Harbor Turn",
        note: "Ships and piers curving under the final approach.",
        seatLabel: "Window B",
        tone: "sea"
      },
      {
        id: "golden-dune",
        label: "Golden Dune",
        note: "Warm sand texture under late afternoon light.",
        seatLabel: "Window C",
        tone: "amber"
      }
    ],
    id: "window-memory-04",
    prompt: "Which scene was shown at Window B?",
    targetCardId: "harbor-turn"
  }
];

const RECALL_OPTIONS = Array.from(
  new Map(
    MEMORY_ROUNDS.flatMap((round) => round.cards).map((card) => [card.id, card])
  ).values()
);

export function WindowViewMemoryPackagePage() {
  const { launchContext } = usePackageLaunchContext("window-view-memory");
  const [stage, setStage] = useState<GameStage>("briefing");
  const [roundIndex, setRoundIndex] = useState(0);
  const [answers, setAnswers] = useState<RoundAnswer[]>([]);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const currentRound = MEMORY_ROUNDS[roundIndex] ?? null;
  const correctCount = useMemo(
    () => answers.filter((answer) => answer.correct).length,
    [answers]
  );
  const accuracy = useMemo(() => {
    if (answers.length === 0) {
      return 0;
    }

    return Math.round((correctCount / answers.length) * 100);
  }, [answers.length, correctCount]);
  const memoryPoints = useMemo(
    () => Math.max(10, correctCount * 11 + (accuracy >= 75 ? 6 : 0)),
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
    setStage("memorize");
    setRoundIndex(0);
    setAnswers([]);
  }

  function handleAdvanceToRecall() {
    if (!currentRound || stage !== "memorize") {
      return;
    }

    setStage("recall");
  }

  function handleAnswer(selectedCardId: string) {
    if (!currentRound || stage !== "recall") {
      return;
    }

    const answer = {
      correct: selectedCardId === currentRound.targetCardId,
      roundId: currentRound.id,
      selectedCardId
    };

    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);

    if (roundIndex + 1 >= MEMORY_ROUNDS.length) {
      setStage("completed");
      return;
    }

    setRoundIndex((current) => current + 1);
    setStage("memorize");
  }

  async function handleReportPoints() {
    if (stage !== "completed") {
      return;
    }

    setIsReportingPoints(true);

    try {
      const response = await reportPoints({
        airline_code: launchContext.airlineCode,
        game_id: "window-view-memory",
        metadata: {
          accuracy,
          correct_count: correctCount,
          rounds_completed: answers.length
        },
        passenger_id: launchContext.passengerId,
        points: memoryPoints,
        reason: "window view memory package completed",
        report_id: [
          "window-view-memory",
          launchContext.passengerId,
          launchContext.sessionId,
          memoryPoints
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
          <h1>Window View Memory Package</h1>
          <p className="lede">
            单机记忆训练短局。先记住每个舷窗位上的景象，再在回忆阶段找出正确的窗外画面，
            用更高准确率完成整轮飞行观察训练。
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
              {Math.min(roundIndex + (stage === "completed" ? 0 : 1), MEMORY_ROUNDS.length)}/
              {MEMORY_ROUNDS.length}
            </strong>
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
              <p>solo memory drill</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.summary.total_points ?? 0}</strong>
              <p>latest points wallet total</p>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Gameplay</p>
              <h2>Window recall flow</h2>
            </div>
            <span className="pill-tag">single-player</span>
          </div>

          {stage === "briefing" ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>记忆规则</strong>
                <p>
                  每轮先观察 3 个舷窗位上的景象卡，再进入回忆阶段，根据问题选出正确的窗景。
                  共 4 轮，准确率越高，积分越高。
                </p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Rounds</span>
                  <strong>{MEMORY_ROUNDS.length}</strong>
                  <p>固定四轮短局，适合机上碎片时间。</p>
                </article>
                <article className="points-card">
                  <span>Points Formula</span>
                  <strong>{memoryPoints}</strong>
                  <p>按正确题数结算，准确率达到 75% 以上有额外奖励。</p>
                </article>
              </div>

              <button className="action-button action-button-primary" onClick={handleStart}>
                开始记忆训练
              </button>
            </div>
          ) : null}

          {stage !== "briefing" && currentRound ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>
                  Round {roundIndex + 1} / {MEMORY_ROUNDS.length}
                </strong>
                <p>
                  {stage === "memorize"
                    ? "先观察每个舷窗位上的景象和位置，再进入回忆阶段。"
                    : currentRound.prompt}
                </p>
              </div>

              <div className="cabin-puzzle-grid">
                {currentRound.cards.map((card) => (
                  <article className="cabin-puzzle-tile" key={card.id}>
                    <span>{card.seatLabel}</span>
                    <strong>{card.label}</strong>
                    <p>{card.note}</p>
                    <small>{card.tone.toUpperCase()}</small>
                  </article>
                ))}
              </div>

              {stage === "memorize" ? (
                <button
                  className="action-button action-button-primary"
                  onClick={handleAdvanceToRecall}
                >
                  进入回忆阶段
                </button>
              ) : null}

              {stage === "recall" ? (
                <div className="card-clash-hand">
                  {RECALL_OPTIONS.map((card) => (
                    <button
                      className={`card-option accent-${card.tone}`}
                      key={card.id}
                      onClick={() => {
                        handleAnswer(card.id);
                      }}
                      type="button"
                    >
                      <span>{card.seatLabel}</span>
                      <strong>{card.label}</strong>
                      <p>{card.note}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {stage === "completed" ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>训练完成</strong>
                <p>
                  你已完成全部 {MEMORY_ROUNDS.length} 轮窗景回忆。
                  当前正确 {correctCount} 轮，准确率 {accuracy}%。
                </p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Correct Answers</span>
                  <strong>{correctCount}</strong>
                  <p>完成 {answers.length} 轮后统计的正确数。</p>
                </article>
                <article className="points-card">
                  <span>Package Points</span>
                  <strong>{memoryPoints}</strong>
                  <p>本局结束后可上报到积分中心。</p>
                </article>
              </div>

              <div className="launcher-meta-grid">
                {answers.map((answer) => {
                  const selectedCard = RECALL_OPTIONS.find(
                    (card) => card.id === answer.selectedCardId
                  );

                  return (
                    <div className="quiz-meta-card" key={answer.roundId}>
                      <span>{answer.roundId}</span>
                      <strong>{answer.correct ? "Correct" : "Missed"}</strong>
                      <p>{selectedCard?.label ?? answer.selectedCardId}</p>
                    </div>
                  );
                })}
              </div>

              <div className="button-row">
                <button
                  className="action-button action-button-primary"
                  disabled={isReportingPoints}
                  onClick={() => {
                    void handleReportPoints();
                  }}
                >
                  {isReportingPoints ? "积分上报中..." : "上报积分"}
                </button>
                <button className="action-button" onClick={handleStart}>
                  再玩一局
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </section>
    </main>
  );
}
