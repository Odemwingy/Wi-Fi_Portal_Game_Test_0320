import { useEffect, useMemo, useState } from "react";

import {
  apiBaseUrl,
  getPassengerPointsSummary,
  reportPoints
} from "./channel-api";
import { usePackageLaunchContext } from "./package-launch-context";

type RepairToolId = "aligner" | "fastener" | "sealant";

type RepairTool = {
  hint: string;
  id: RepairToolId;
  label: string;
};

type RepairRound = {
  id: string;
  prompt: string;
  station: string;
  targetPart: string;
  toolSequence: RepairToolId[];
};

type RepairLog = {
  completed: boolean;
  mistakes: number;
  roundId: string;
  station: string;
};

type GameStage = "briefing" | "playing" | "completed";

const REPAIR_TOOLS: RepairTool[] = [
  {
    id: "aligner",
    label: "Panel Aligner",
    hint: "Use first to line the part back into the service frame."
  },
  {
    id: "fastener",
    label: "Latch Fastener",
    hint: "Locks the aligned part back into place."
  },
  {
    id: "sealant",
    label: "Seal Check",
    hint: "Finishes the repair and clears the cabin readiness check."
  }
];

const REPAIR_ROUNDS: RepairRound[] = [
  {
    id: "repair-01",
    prompt: "Reset the overhead light panel before the quiet cabin check begins.",
    station: "Overhead Light Bay",
    targetPart: "Reading Light Panel",
    toolSequence: ["aligner", "fastener", "sealant"]
  },
  {
    id: "repair-02",
    prompt: "Secure the service tray hinge so it can clear the aisle inspection.",
    station: "Galley Service Cart",
    targetPart: "Tray Hinge Assembly",
    toolSequence: ["fastener", "aligner", "sealant"]
  },
  {
    id: "repair-03",
    prompt: "Stabilize the window shade guide before the final cabin dimming routine.",
    station: "Window Shade Track",
    targetPart: "Shade Guide Rail",
    toolSequence: ["aligner", "sealant", "fastener"]
  }
];

export function AircraftFixKitPackagePage() {
  const { launchContext } = usePackageLaunchContext("aircraft-fix-kit");
  const [stage, setStage] = useState<GameStage>("briefing");
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedSequence, setSelectedSequence] = useState<RepairToolId[]>([]);
  const [roundLogs, setRoundLogs] = useState<RepairLog[]>([]);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [roundMistakes, setRoundMistakes] = useState(0);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const currentRound = REPAIR_ROUNDS[roundIndex] ?? null;
  const completedRounds = roundLogs.filter((entry) => entry.completed).length;
  const repairPoints = useMemo(
    () => Math.max(14, completedRounds * 18 + Math.max(0, 12 - mistakeCount * 2)),
    [completedRounds, mistakeCount]
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
    setSelectedSequence([]);
    setRoundLogs([]);
    setMistakeCount(0);
    setRoundMistakes(0);
  }

  function handleToolSelect(toolId: RepairToolId) {
    if (!currentRound || stage !== "playing") {
      return;
    }

    if (selectedSequence.includes(toolId)) {
      return;
    }

    const expectedToolId = currentRound.toolSequence[selectedSequence.length];
    if (toolId !== expectedToolId) {
      setMistakeCount((current) => current + 1);
      setRoundMistakes((current) => current + 1);
      return;
    }

    const nextSequence = [...selectedSequence, toolId];
    setSelectedSequence(nextSequence);

    if (nextSequence.length !== currentRound.toolSequence.length) {
      return;
    }

    const nextLogs = [
      ...roundLogs,
      {
        completed: true,
        mistakes: roundMistakes,
        roundId: currentRound.id,
        station: currentRound.station
      }
    ];

    setRoundLogs(nextLogs);
    setSelectedSequence([]);
    setRoundMistakes(0);

    if (roundIndex + 1 >= REPAIR_ROUNDS.length) {
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
        airline_code: launchContext.airlineCode,
        game_id: "aircraft-fix-kit",
        metadata: {
          completed_rounds: completedRounds,
          mistakes: mistakeCount,
          total_rounds: REPAIR_ROUNDS.length
        },
        passenger_id: launchContext.passengerId,
        points: repairPoints,
        reason: "aircraft fix kit package completed",
        report_id: [
          "aircraft-fix-kit",
          launchContext.passengerId,
          launchContext.sessionId,
          repairPoints
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
          <h1>Aircraft Fix Kit Package</h1>
          <p className="lede">
            单机系统修复短局。你需要在 3 个舱内维修站点按正确顺序使用工具，
            完成部件校正、锁定与密封检查，以更少失误拿到更高积分。
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
            <span>Repairs</span>
            <strong>
              {completedRounds}/{REPAIR_ROUNDS.length}
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
              <span>Total Mistakes</span>
              <strong>{mistakeCount}</strong>
              <p>错误工具顺序会累计到最终积分。</p>
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
              <h2>Repair flow</h2>
            </div>
            <span className="pill-tag">single-player</span>
          </div>

          {stage === "briefing" ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>维修规则</strong>
                <p>
                  每轮按正确顺序点击 3 个工具，完成部件校准、锁定和封检。
                  点错顺序会累计失误，但不会中断本轮。
                </p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Stations</span>
                  <strong>{REPAIR_ROUNDS.length}</strong>
                  <p>三段轻量修复流程，适合短时单机游玩。</p>
                </article>
                <article className="points-card">
                  <span>Points Formula</span>
                  <strong>{repairPoints}</strong>
                  <p>完成站点越多、失误越少，最终积分越高。</p>
                </article>
              </div>

              <button className="action-button action-button-primary" onClick={handleStart}>
                开始检修
              </button>
            </div>
          ) : null}

          {stage === "playing" && currentRound ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>{currentRound.station}</strong>
                <p>{currentRound.prompt}</p>
              </div>

              <div className="launcher-meta-grid">
                <div className="quiz-meta-card">
                  <span>Target Part</span>
                  <strong>{currentRound.targetPart}</strong>
                  <p>按正确顺序完成这一维修站点。</p>
                </div>
                <div className="quiz-meta-card">
                  <span>Round Progress</span>
                  <strong>
                    {selectedSequence.length}/{currentRound.toolSequence.length}
                  </strong>
                  <p>当前轮已完成的工具步骤。</p>
                </div>
                <div className="quiz-meta-card">
                  <span>Round Mistakes</span>
                  <strong>{roundMistakes}</strong>
                  <p>本轮错误点击次数。</p>
                </div>
              </div>

              <div className="quiz-options-grid">
                {REPAIR_TOOLS.map((tool) => {
                  const isSelected = selectedSequence.includes(tool.id);
                  const isNext = currentRound.toolSequence[selectedSequence.length] === tool.id;

                  return (
                    <button
                      className="quiz-option-card"
                      key={tool.id}
                      onClick={() => {
                        handleToolSelect(tool.id);
                      }}
                      style={{
                        borderColor: isSelected
                          ? "rgba(115, 221, 179, 0.72)"
                          : isNext
                            ? "rgba(245, 191, 66, 0.68)"
                            : undefined,
                        transform: isSelected ? "translateY(-2px)" : undefined
                      }}
                      type="button"
                    >
                      <span>{tool.label}</span>
                      <strong>{tool.id.toUpperCase()}</strong>
                      <p>{tool.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {stage === "completed" ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>检修任务完成</strong>
                <p>
                  你已完成全部 {REPAIR_ROUNDS.length} 个维修站点，累计失误 {mistakeCount} 次，
                  可以将本局积分上报到积分中心。
                </p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Completed Repairs</span>
                  <strong>{completedRounds}</strong>
                  <p>全部站点都已经通过维修检查。</p>
                </article>
                <article className="points-card">
                  <span>Package Points</span>
                  <strong>{repairPoints}</strong>
                  <p>本局结束后可上报到积分中心。</p>
                </article>
              </div>

              <div className="launcher-meta-grid">
                {roundLogs.map((entry) => (
                  <div className="quiz-meta-card" key={entry.roundId}>
                    <span>{entry.station}</span>
                    <strong>{entry.completed ? "Completed" : "Pending"}</strong>
                    <p>{entry.mistakes} mistakes</p>
                  </div>
                ))}
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
