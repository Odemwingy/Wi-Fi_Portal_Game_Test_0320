import { useEffect, useState } from "react";

import {
  apiBaseUrl,
  getPassengerPointsSummary,
  reportPoints
} from "./channel-api";
import { usePackageLaunchContext } from "./package-launch-context";

type GameStage = "briefing" | "playing" | "completed";

type SeatZone = "aisle" | "window";

type CabinSeat = {
  label: string;
  seatId: string;
  zone: SeatZone;
};

type PassengerPlan = {
  id: string;
  name: string;
  preferredSeatId: string;
  reason: string;
};

type SeatUpgradeRound = {
  id: string;
  idealSwaps: number;
  passengers: PassengerPlan[];
  startingAssignments: Record<string, string>;
  summary: string;
  seats: CabinSeat[];
  title: string;
};

type RoundResult = {
  idealSwaps: number;
  roundId: string;
  swapCount: number;
  title: string;
};

const SEAT_UPGRADE_ROUNDS: SeatUpgradeRound[] = [
  {
    id: "round-1",
    idealSwaps: 2,
    passengers: [
      {
        id: "mila",
        name: "Mila",
        preferredSeatId: "2A",
        reason: "想看晨光云层，需要靠窗位。"
      },
      {
        id: "noah",
        name: "Noah",
        preferredSeatId: "2B",
        reason: "转机时间紧，希望靠过道。"
      },
      {
        id: "li",
        name: "Li",
        preferredSeatId: "2C",
        reason: "随身包频繁取放，适合右侧过道。"
      },
      {
        id: "zoe",
        name: "Zoe",
        preferredSeatId: "2D",
        reason: "喜欢安静夜景，希望保留右侧窗景。"
      }
    ],
    startingAssignments: {
      "2A": "noah",
      "2B": "mila",
      "2C": "zoe",
      "2D": "li"
    },
    summary: "把靠窗乘客换回窗边，让快转机和高频取包的乘客回到过道。",
    seats: [
      { label: "2A", seatId: "2A", zone: "window" },
      { label: "2B", seatId: "2B", zone: "aisle" },
      { label: "2C", seatId: "2C", zone: "aisle" },
      { label: "2D", seatId: "2D", zone: "window" }
    ],
    title: "Sunrise Upgrade"
  },
  {
    id: "round-2",
    idealSwaps: 3,
    passengers: [
      {
        id: "ava",
        name: "Ava",
        preferredSeatId: "3D",
        reason: "想和家人一起看窗外，需要右侧靠窗。"
      },
      {
        id: "finn",
        name: "Finn",
        preferredSeatId: "3B",
        reason: "需要频繁起身，左侧过道最合适。"
      },
      {
        id: "chloe",
        name: "Chloe",
        preferredSeatId: "3A",
        reason: "怕眩晕，靠窗更稳定。"
      },
      {
        id: "leo",
        name: "Leo",
        preferredSeatId: "3C",
        reason: "照顾同伴，右侧过道方便沟通。"
      }
    ],
    startingAssignments: {
      "3A": "finn",
      "3B": "ava",
      "3C": "chloe",
      "3D": "leo"
    },
    summary: "这轮是一个四人循环位移，尽量用最少交换把四位乘客都送回偏好座位。",
    seats: [
      { label: "3A", seatId: "3A", zone: "window" },
      { label: "3B", seatId: "3B", zone: "aisle" },
      { label: "3C", seatId: "3C", zone: "aisle" },
      { label: "3D", seatId: "3D", zone: "window" }
    ],
    title: "Family Shuffle"
  },
  {
    id: "round-3",
    idealSwaps: 2,
    passengers: [
      {
        id: "iris",
        name: "Iris",
        preferredSeatId: "4A",
        reason: "要拍窗外航迹，左侧窗位优先。"
      },
      {
        id: "omar",
        name: "Omar",
        preferredSeatId: "4B",
        reason: "腿部活动频繁，靠过道更舒展。"
      },
      {
        id: "riko",
        name: "Riko",
        preferredSeatId: "4C",
        reason: "需要照看行李，右侧过道更顺手。"
      },
      {
        id: "nina",
        name: "Nina",
        preferredSeatId: "4D",
        reason: "更喜欢夜景和安静环境。"
      }
    ],
    startingAssignments: {
      "4A": "nina",
      "4B": "omar",
      "4C": "iris",
      "4D": "riko"
    },
    summary: "最后一轮考验你识别双边窗位和双过道位的直觉，别做多余交换。",
    seats: [
      { label: "4A", seatId: "4A", zone: "window" },
      { label: "4B", seatId: "4B", zone: "aisle" },
      { label: "4C", seatId: "4C", zone: "aisle" },
      { label: "4D", seatId: "4D", zone: "window" }
    ],
    title: "Night Cabin Reset"
  }
];

export function SeatUpgradeShufflePackagePage() {
  const { launchContext } = usePackageLaunchContext("seat-upgrade-shuffle");
  const [stage, setStage] = useState<GameStage>("briefing");
  const [roundIndex, setRoundIndex] = useState(0);
  const [assignments, setAssignments] = useState<Record<string, string>>(
    createAssignments(SEAT_UPGRADE_ROUNDS[0])
  );
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [swapCount, setSwapCount] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const currentRound = SEAT_UPGRADE_ROUNDS[roundIndex] ?? SEAT_UPGRADE_ROUNDS[0];
  const completedSwaps = roundResults.reduce(
    (total, result) => total + result.swapCount,
    0
  );
  const perfectRounds = roundResults.filter(
    (result) => result.swapCount <= result.idealSwaps
  ).length;
  const shufflePoints = Math.max(
    16,
    12 + roundResults.length * 6 + perfectRounds * 4 - completedSwaps
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
    setRoundIndex(0);
    setAssignments(createAssignments(SEAT_UPGRADE_ROUNDS[0]));
    setSelectedSeatId(null);
    setSwapCount(0);
    setRoundResults([]);
  }

  function handleSeatSelect(seatId: string) {
    if (stage !== "playing") {
      return;
    }

    if (selectedSeatId === null) {
      setSelectedSeatId(seatId);
      return;
    }

    if (selectedSeatId === seatId) {
      setSelectedSeatId(null);
      return;
    }

    const nextAssignments = {
      ...assignments,
      [selectedSeatId]: assignments[seatId],
      [seatId]: assignments[selectedSeatId]
    };
    const nextSwapCount = swapCount + 1;
    const roundSolved = currentRound.passengers.every(
      (passenger) => nextAssignments[passenger.preferredSeatId] === passenger.id
    );

    if (!roundSolved) {
      setAssignments(nextAssignments);
      setSwapCount(nextSwapCount);
      setSelectedSeatId(null);
      return;
    }

    const nextResults = [
      ...roundResults,
      {
        idealSwaps: currentRound.idealSwaps,
        roundId: currentRound.id,
        swapCount: nextSwapCount,
        title: currentRound.title
      }
    ];

    setAssignments(nextAssignments);
    setRoundResults(nextResults);
    setSelectedSeatId(null);

    if (roundIndex + 1 >= SEAT_UPGRADE_ROUNDS.length) {
      setSwapCount(nextSwapCount);
      setStage("completed");
      return;
    }

    setRoundIndex((current) => current + 1);
    setAssignments(createAssignments(SEAT_UPGRADE_ROUNDS[roundIndex + 1]));
    setSwapCount(0);
  }

  async function handleReportPoints() {
    if (stage !== "completed") {
      return;
    }

    setIsReportingPoints(true);

    try {
      const response = await reportPoints({
        airline_code: launchContext.airlineCode,
        game_id: "seat-upgrade-shuffle",
        metadata: {
          completed_rounds: roundResults.length,
          perfect_rounds: perfectRounds,
          total_swaps: completedSwaps
        },
        passenger_id: launchContext.passengerId,
        points: shufflePoints,
        reason: "seat upgrade shuffle package completed",
        report_id: [
          "seat-upgrade-shuffle",
          launchContext.passengerId,
          launchContext.sessionId,
          shufflePoints
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
          <h1>Seat Upgrade Shuffle Package</h1>
          <p className="lede">
            单机座位重排益智短局。你需要在每一轮里用尽量少的交换，把乘客重新安排到他们偏好的窗位或过道位，
            模拟一次高效的机上升舱调座。
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
              {Math.min(roundIndex + 1, SEAT_UPGRADE_ROUNDS.length)}/{SEAT_UPGRADE_ROUNDS.length}
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
              <p>room_id {launchContext.roomId ?? "not required"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Total Swaps</span>
              <strong>{completedSwaps + (stage === "playing" ? swapCount : 0)}</strong>
              <p>交换越少，本局积分越高</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Shuffle Reward</span>
              <strong>{shufflePoints}</strong>
              <p>通关后可回传的建议积分</p>
            </div>
          </div>

          <div className="launcher-actions">
            {stage === "briefing" ? (
              <button
                className="action-button action-button-primary"
                onClick={handleStart}
                type="button"
              >
                开始 Seat Upgrade Shuffle
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
              <p className="panel-kicker">Seat Logic</p>
              <h2>{currentRound.title}</h2>
            </div>
            <span className="panel-status">
              {stage === "completed" ? "all rounds solved" : `ideal swaps ${currentRound.idealSwaps}`}
            </span>
          </div>

          <div className="seat-upgrade-layout">
            <div className="seat-upgrade-board">
              <div className="action-strip">
                <div>
                  <p className="mini-label">round brief</p>
                  <strong>{currentRound.summary}</strong>
                </div>
                <div>
                  <p className="mini-label">selected seat</p>
                  <strong>{selectedSeatId ?? "none"}</strong>
                </div>
                <div>
                  <p className="mini-label">current swaps</p>
                  <strong>{stage === "completed" ? completedSwaps : swapCount}</strong>
                </div>
              </div>

              <div className="seat-upgrade-legend">
                <span>先点击一个座位，再点击第二个座位完成交换。</span>
                <span>绿色边框表示该座位上的乘客已经满足偏好。</span>
              </div>

              <div className="seat-map-grid">
                {currentRound.seats.map((seat) => {
                  const passengerId = assignments[seat.seatId];
                  const passenger = currentRound.passengers.find(
                    (candidate) => candidate.id === passengerId
                  );
                  const isSatisfied = passenger?.preferredSeatId === seat.seatId;

                  return (
                    <button
                      className={[
                        "seat-map-seat",
                        "seat-upgrade-seat",
                        seat.zone === "window" ? "seat-window" : "seat-aisle",
                        isSatisfied ? "is-satisfied" : "",
                        selectedSeatId === seat.seatId ? "is-selected" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={seat.seatId}
                      onClick={() => {
                        handleSeatSelect(seat.seatId);
                      }}
                      type="button"
                    >
                      <span>{seat.zone}</span>
                      <strong>{seat.label}</strong>
                      <small>{passenger?.name ?? "Unassigned"}</small>
                      <p>{passenger?.reason ?? "Select a passenger swap target."}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="seat-upgrade-sidebar">
              <div className="json-card">
                <p className="mini-label">round targets</p>
                <div className="seat-upgrade-passenger-list">
                  {currentRound.passengers.map((passenger) => {
                    const assignedSeatId = findAssignedSeat(assignments, passenger.id);
                    const isSatisfied = assignedSeatId === passenger.preferredSeatId;

                    return (
                      <article
                        className={[
                          "seat-upgrade-passenger",
                          isSatisfied ? "is-satisfied" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={passenger.id}
                      >
                        <span>{passenger.name}</span>
                        <strong>
                          {assignedSeatId ?? "-"} {"->"} {passenger.preferredSeatId}
                        </strong>
                        <p>{passenger.reason}</p>
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="json-card">
                <p className="mini-label">completed rounds</p>
                <div className="seat-upgrade-results">
                  {roundResults.length === 0 ? (
                    <p className="lede compact">还没有完成的轮次，先解开当前座位排列。</p>
                  ) : (
                    roundResults.map((result) => (
                      <article className="seat-upgrade-result" key={result.roundId}>
                        <span>{result.title}</span>
                        <strong>{result.swapCount} swaps</strong>
                        <p>
                          {result.swapCount <= result.idealSwaps
                            ? "perfect efficiency"
                            : `ideal ${result.idealSwaps}`}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
        </article>
      </section>
    </main>
  );
}

function createAssignments(round: SeatUpgradeRound) {
  return { ...round.startingAssignments };
}

function findAssignedSeat(
  assignments: Record<string, string>,
  passengerId: string
) {
  return (
    Object.entries(assignments).find(
      ([, assignedPassengerId]) => assignedPassengerId === passengerId
    )?.[0] ?? null
  );
}
