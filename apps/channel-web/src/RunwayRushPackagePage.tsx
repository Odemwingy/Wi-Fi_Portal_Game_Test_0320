import { useEffect, useMemo, useState } from "react";

import {
  apiBaseUrl,
  getPassengerPointsSummary,
  reportPoints
} from "./channel-api";
import {
  readPackageLaunchContext,
  type PackageLaunchContext
} from "./package-launch-context";

type ChallengeOption = {
  id: string;
  label: string;
  tone: "safe" | "warn";
};

type ChallengeRound = {
  hint: string;
  id: string;
  options: ChallengeOption[];
  prompt: string;
  safeOptionId: string;
};

type RoundResult = {
  correct: boolean;
  roundId: string;
  selectedOptionId: string;
};

type RushStage = "briefing" | "playing" | "completed";

const CHALLENGE_ROUNDS: ChallengeRound[] = [
  {
    hint: "Look for the runway marker cleared for takeoff.",
    id: "runway-01",
    options: [
      { id: "rw-a1", label: "Runway 18L", tone: "safe" },
      { id: "rw-a2", label: "Taxi Hold", tone: "warn" },
      { id: "rw-a3", label: "Gate Return", tone: "warn" },
      { id: "rw-a4", label: "Cabin Delay", tone: "warn" }
    ],
    prompt: "Select the runway call that keeps the departure flow moving.",
    safeOptionId: "rw-a1"
  },
  {
    hint: "Find the option that keeps the aircraft aligned for departure.",
    id: "runway-02",
    options: [
      { id: "rw-b1", label: "Pushback Pause", tone: "warn" },
      { id: "rw-b2", label: "Runway 22R", tone: "safe" },
      { id: "rw-b3", label: "Service Check", tone: "warn" },
      { id: "rw-b4", label: "Cabin Reopen", tone: "warn" }
    ],
    prompt: "Tap the cleared route before the tower window closes.",
    safeOptionId: "rw-b2"
  },
  {
    hint: "Only one signal keeps the plane in departure sequence.",
    id: "runway-03",
    options: [
      { id: "rw-c1", label: "Fuel Review", tone: "warn" },
      { id: "rw-c2", label: "Runway 09", tone: "safe" },
      { id: "rw-c3", label: "Seat Count", tone: "warn" },
      { id: "rw-c4", label: "Baggage Sync", tone: "warn" }
    ],
    prompt: "Choose the runway signal that should be acknowledged now.",
    safeOptionId: "rw-c2"
  },
  {
    hint: "The safe card is the only active runway assignment.",
    id: "runway-04",
    options: [
      { id: "rw-d1", label: "Gate 12", tone: "warn" },
      { id: "rw-d2", label: "Runway 31C", tone: "safe" },
      { id: "rw-d3", label: "Meal Hold", tone: "warn" },
      { id: "rw-d4", label: "Crew Reset", tone: "warn" }
    ],
    prompt: "Confirm the active departure runway before the timer runs out.",
    safeOptionId: "rw-d2"
  },
  {
    hint: "Pick the runway tag that means the aircraft can keep rolling.",
    id: "runway-05",
    options: [
      { id: "rw-e1", label: "Runway 14L", tone: "safe" },
      { id: "rw-e2", label: "Cabin Call", tone: "warn" },
      { id: "rw-e3", label: "Water Delay", tone: "warn" },
      { id: "rw-e4", label: "Standby Hold", tone: "warn" }
    ],
    prompt: "Tap the correct runway marker to preserve your reaction streak.",
    safeOptionId: "rw-e1"
  },
  {
    hint: "Last round. Find the runway that finishes the departure chain cleanly.",
    id: "runway-06",
    options: [
      { id: "rw-f1", label: "Wi-Fi Reset", tone: "warn" },
      { id: "rw-f2", label: "Runway 27", tone: "safe" },
      { id: "rw-f3", label: "Boarding Reopen", tone: "warn" },
      { id: "rw-f4", label: "Cabin Sweep", tone: "warn" }
    ],
    prompt: "Choose the final runway call and close out the sprint.",
    safeOptionId: "rw-f2"
  }
];

export function RunwayRushPackagePage() {
  const [launchContext] = useState<PackageLaunchContext>(() =>
    readPackageLaunchContext(window.location.search)
  );
  const [stage, setStage] = useState<RushStage>("briefing");
  const [roundIndex, setRoundIndex] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const currentRound = CHALLENGE_ROUNDS[roundIndex] ?? null;
  const correctCount = useMemo(
    () => results.filter((result) => result.correct).length,
    [results]
  );
  const totalScore = useMemo(
    () => results.reduce((score, result) => score + (result.correct ? 12 : 3), 0) + bestStreak * 2,
    [bestStreak, results]
  );
  const accuracy = useMemo(() => {
    if (results.length === 0) {
      return 0;
    }

    return Math.round((correctCount / results.length) * 100);
  }, [correctCount, results.length]);

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
    setRoundIndex(0);
    setResults([]);
    setStreak(0);
    setBestStreak(0);
  }

  function handleOptionSelect(optionId: string) {
    if (!currentRound || stage !== "playing") {
      return;
    }

    const correct = optionId === currentRound.safeOptionId;
    const nextStreak = correct ? streak + 1 : 0;

    setResults((current) => [
      ...current,
      {
        correct,
        roundId: currentRound.id,
        selectedOptionId: optionId
      }
    ]);
    setStreak(nextStreak);
    setBestStreak((current) => Math.max(current, nextStreak));

    if (roundIndex + 1 >= CHALLENGE_ROUNDS.length) {
      setStage("completed");
      return;
    }

    setRoundIndex((current) => current + 1);
  }

  async function handleReportPoints() {
    if (stage !== "completed") {
      return;
    }

    setIsReportingPoints(true);

    try {
      const response = await reportPoints({
        game_id: "runway-rush",
        metadata: {
          accuracy,
          best_streak: bestStreak,
          rounds_completed: results.length
        },
        passenger_id: launchContext.passengerId,
        points: Math.max(10, totalScore),
        reason: "runway rush package completed",
        report_id: [
          "runway-rush",
          launchContext.passengerId,
          launchContext.sessionId,
          totalScore
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
          <h1>Runway Rush Package</h1>
          <p className="lede">
            这是一个轻量单机反应类 package。它复用现有 launcher 和积分上报，但不依赖房间或 WS，
            用来验证 Wave A 的第二种单机玩法。
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
              <p>{correctCount}/{results.length || CHALLENGE_ROUNDS.length} rounds correct</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Rush Reward</span>
              <strong>{totalScore}</strong>
              <p>本局完成后可回传的建议积分</p>
            </div>
          </div>

          <div className="launcher-actions">
            {stage === "briefing" ? (
              <button
                className="action-button action-button-primary"
                onClick={handleStart}
                type="button"
              >
                开始 Runway Rush
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
              <h2>Runway Rush</h2>
            </div>
            <span className="pill">
              {stage === "playing" && currentRound
                ? `Round ${roundIndex + 1}/${CHALLENGE_ROUNDS.length}`
                : stage}
            </span>
          </div>

          {stage === "briefing" ? (
            <div className="panel-hint">
              <strong>玩法说明</strong>
              <p>每一轮会出现 4 个信号卡片。尽快点出唯一正确的 runway clearance。</p>
            </div>
          ) : null}

          {currentRound ? (
            <section className="quiz-stage">
              <div className="quiz-header">
                <div>
                  <p className="mini-label">Prompt</p>
                  <h3>{currentRound.prompt}</h3>
                  <p className="quiz-roundline">
                    {stage === "completed"
                      ? `Final ${CHALLENGE_ROUNDS.length}/${CHALLENGE_ROUNDS.length}`
                      : `Round ${roundIndex + 1}/${CHALLENGE_ROUNDS.length}`}
                    <span>{currentRound.hint}</span>
                  </p>
                </div>
                <span
                  className={`status-pill ${
                    stage === "completed" ? "status-connected" : "status-connecting"
                  }`}
                >
                  {stage === "completed"
                    ? "本局已结束"
                    : `streak ${streak} / best ${bestStreak}`}
                </span>
              </div>

              <div className="choice-grid">
                {currentRound.options.map((option) => (
                  <button
                    className="choice-button"
                    disabled={stage !== "playing"}
                    key={option.id}
                    onClick={() => {
                      handleOptionSelect(option.id);
                    }}
                    type="button"
                  >
                    <span className="choice-label">
                      {option.tone === "safe" ? "GO" : "HOLD"}
                    </span>
                    <strong>{option.label}</strong>
                    <small>{option.tone === "safe" ? "Correct runway signal" : "Discard this distractor"}</small>
                  </button>
                ))}
              </div>

              <div className="quiz-meta-grid">
                <div className="quiz-meta-card">
                  <span>Correct</span>
                  <strong>{correctCount}</strong>
                  <p>累计答对轮数</p>
                </div>
                <div className="quiz-meta-card">
                  <span>Best Streak</span>
                  <strong>{bestStreak}</strong>
                  <p>连续正确的最好成绩</p>
                </div>
                <div className="quiz-meta-card">
                  <span>Completed Rounds</span>
                  <strong>{results.length}</strong>
                  <p>总轮数 {CHALLENGE_ROUNDS.length}</p>
                </div>
                <div className="quiz-meta-card">
                  <span>Status</span>
                  <strong>{stage}</strong>
                  <p>{stage === "completed" ? "可以回传积分" : "继续点击正确 runway card"}</p>
                </div>
              </div>
            </section>
          ) : null}

          <div className="round-history">
            {results.length === 0 ? (
              <div className="panel-hint">
                <strong>还没有作答记录</strong>
                <p>开始后，每轮选择结果会显示在这里。</p>
              </div>
            ) : (
              results.map((result, index) => (
                <article className="round-history-card" key={`${result.roundId}-${index}`}>
                  <div className="round-history-topline">
                    <strong>Round {index + 1}</strong>
                    <span>{result.roundId}</span>
                  </div>
                  <p>选择: {result.selectedOptionId}</p>
                  <p>{result.correct ? "判断正确，继续保持速度。" : "本轮误判，streak 已重置。"}</p>
                  <div className="tag-row">
                    <span className="tag">{result.correct ? "correct" : "incorrect"}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
