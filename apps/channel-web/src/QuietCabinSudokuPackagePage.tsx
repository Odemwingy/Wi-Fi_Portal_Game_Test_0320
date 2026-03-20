import { useEffect, useMemo, useState } from "react";

import {
  apiBaseUrl,
  getPassengerPointsSummary,
  reportPoints
} from "./channel-api";
import { usePackageLaunchContext } from "./package-launch-context";

type PuzzleCell = {
  col: number;
  id: string;
  initialValue: number | null;
  row: number;
  solution: number;
};

type CabinPuzzle = {
  cells: PuzzleCell[];
  id: string;
  title: string;
};

type GameStage = "briefing" | "playing" | "completed";

const CABIN_SUDOKU_PUZZLES: CabinPuzzle[] = [
  {
    cells: [
      { col: 0, id: "p1-r1c1", initialValue: 1, row: 0, solution: 1 },
      { col: 1, id: "p1-r1c2", initialValue: null, row: 0, solution: 2 },
      { col: 2, id: "p1-r1c3", initialValue: null, row: 0, solution: 3 },
      { col: 3, id: "p1-r1c4", initialValue: 4, row: 0, solution: 4 },
      { col: 0, id: "p1-r2c1", initialValue: null, row: 1, solution: 3 },
      { col: 1, id: "p1-r2c2", initialValue: 4, row: 1, solution: 4 },
      { col: 2, id: "p1-r2c3", initialValue: 1, row: 1, solution: 1 },
      { col: 3, id: "p1-r2c4", initialValue: null, row: 1, solution: 2 },
      { col: 0, id: "p1-r3c1", initialValue: 2, row: 2, solution: 2 },
      { col: 1, id: "p1-r3c2", initialValue: null, row: 2, solution: 1 },
      { col: 2, id: "p1-r3c3", initialValue: 4, row: 2, solution: 4 },
      { col: 3, id: "p1-r3c4", initialValue: null, row: 2, solution: 3 },
      { col: 0, id: "p1-r4c1", initialValue: null, row: 3, solution: 4 },
      { col: 1, id: "p1-r4c2", initialValue: 3, row: 3, solution: 3 },
      { col: 2, id: "p1-r4c3", initialValue: null, row: 3, solution: 2 },
      { col: 3, id: "p1-r4c4", initialValue: 1, row: 3, solution: 1 }
    ],
    id: "cabin-grid-a",
    title: "Quiet Cabin Grid A"
  },
  {
    cells: [
      { col: 0, id: "p2-r1c1", initialValue: null, row: 0, solution: 4 },
      { col: 1, id: "p2-r1c2", initialValue: 1, row: 0, solution: 1 },
      { col: 2, id: "p2-r1c3", initialValue: null, row: 0, solution: 2 },
      { col: 3, id: "p2-r1c4", initialValue: 3, row: 0, solution: 3 },
      { col: 0, id: "p2-r2c1", initialValue: 2, row: 1, solution: 2 },
      { col: 1, id: "p2-r2c2", initialValue: null, row: 1, solution: 3 },
      { col: 2, id: "p2-r2c3", initialValue: 4, row: 1, solution: 4 },
      { col: 3, id: "p2-r2c4", initialValue: null, row: 1, solution: 1 },
      { col: 0, id: "p2-r3c1", initialValue: 1, row: 2, solution: 1 },
      { col: 1, id: "p2-r3c2", initialValue: null, row: 2, solution: 4 },
      { col: 2, id: "p2-r3c3", initialValue: 3, row: 2, solution: 3 },
      { col: 3, id: "p2-r3c4", initialValue: null, row: 2, solution: 2 },
      { col: 0, id: "p2-r4c1", initialValue: null, row: 3, solution: 3 },
      { col: 1, id: "p2-r4c2", initialValue: 2, row: 3, solution: 2 },
      { col: 2, id: "p2-r4c3", initialValue: null, row: 3, solution: 1 },
      { col: 3, id: "p2-r4c4", initialValue: 4, row: 3, solution: 4 }
    ],
    id: "cabin-grid-b",
    title: "Quiet Cabin Grid B"
  }
];

const INPUT_OPTIONS = [1, 2, 3, 4];

export function QuietCabinSudokuPackagePage() {
  const { launchContext } = usePackageLaunchContext("quiet-cabin-sudoku");
  const [stage, setStage] = useState<GameStage>("briefing");
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const currentPuzzle = CABIN_SUDOKU_PUZZLES[puzzleIndex] ?? null;

  const completion = useMemo(() => {
    if (!currentPuzzle) {
      return 0;
    }

    const filledCount = currentPuzzle.cells.filter((cell) => {
      const currentValue = values[cell.id];
      return (currentValue ?? cell.initialValue) !== null;
    }).length;

    return Math.round((filledCount / currentPuzzle.cells.length) * 100);
  }, [currentPuzzle, values]);

  const solvedCount = useMemo(() => {
    if (!currentPuzzle) {
      return 0;
    }

    return currentPuzzle.cells.filter((cell) => {
      const currentValue = values[cell.id] ?? cell.initialValue;
      return currentValue === cell.solution;
    }).length;
  }, [currentPuzzle, values]);

  const sudokuPoints = useMemo(
    () => Math.max(14, solvedCount * 2 + Math.max(0, 18 - mistakeCount * 3)),
    [mistakeCount, solvedCount]
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

  function buildInitialValues(puzzle: CabinPuzzle) {
    return Object.fromEntries(
      puzzle.cells.map((cell) => [cell.id, cell.initialValue])
    );
  }

  function handleStart() {
    const nextPuzzle = CABIN_SUDOKU_PUZZLES[(puzzleIndex + 1) % CABIN_SUDOKU_PUZZLES.length];
    setPuzzleIndex((current) => (current + 1) % CABIN_SUDOKU_PUZZLES.length);
    setValues(buildInitialValues(nextPuzzle));
    setSelectedCellId(null);
    setMistakeCount(0);
    setStage("playing");
  }

  function handleSelectCell(cell: PuzzleCell) {
    if (stage !== "playing" || cell.initialValue !== null) {
      return;
    }

    setSelectedCellId(cell.id);
  }

  function handleInput(value: number) {
    if (!currentPuzzle || !selectedCellId || stage !== "playing") {
      return;
    }

    const cell = currentPuzzle.cells.find((entry) => entry.id === selectedCellId);
    if (!cell || cell.initialValue !== null) {
      return;
    }

    if (value !== cell.solution) {
      setMistakeCount((current) => current + 1);
      return;
    }

    const nextValues = {
      ...values,
      [cell.id]: value
    };

    setValues(nextValues);
    setSelectedCellId(null);

    const solved = currentPuzzle.cells.every((entry) => {
      const currentValue = nextValues[entry.id] ?? entry.initialValue;
      return currentValue === entry.solution;
    });

    if (solved) {
      setStage("completed");
    }
  }

  async function handleReportPoints() {
    if (stage !== "completed" || !currentPuzzle) {
      return;
    }

    setIsReportingPoints(true);

    try {
      const response = await reportPoints({
        airline_code: launchContext.airlineCode,
        game_id: "quiet-cabin-sudoku",
        metadata: {
          completion,
          mistakes: mistakeCount,
          puzzle_id: currentPuzzle.id
        },
        passenger_id: launchContext.passengerId,
        points: sudokuPoints,
        reason: "quiet cabin sudoku package completed",
        report_id: [
          "quiet-cabin-sudoku",
          launchContext.passengerId,
          launchContext.sessionId,
          currentPuzzle.id,
          sudokuPoints
        ].join(":"),
        session_id: launchContext.sessionId
      });

      setPointsSummary(response.summary);
    } finally {
      setIsReportingPoints(false);
    }
  }

  const gridRows = useMemo(() => {
    if (!currentPuzzle) {
      return [];
    }

    return Array.from({ length: 4 }, (_, rowIndex) =>
      currentPuzzle.cells.filter((cell) => cell.row === rowIndex)
    );
  }, [currentPuzzle]);

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Iframe Game Package</p>
          <h1>Quiet Cabin Sudoku Package</h1>
          <p className="lede">
            单机数独短局。完成一个轻量 4x4 的静音 cabin grid，把 1 到 4 正确填进每一行和每一列，
            以更少失误完成一轮安静解题。
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
            <span>Completion</span>
            <strong>{completion}%</strong>
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
              <span>Puzzle</span>
              <strong>{currentPuzzle?.title ?? "Not started"}</strong>
              <p>lightweight 4x4 solo sudoku</p>
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
              <h2>Sudoku flow</h2>
            </div>
            <span className="pill-tag">single-player</span>
          </div>

          {stage === "briefing" ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>解题规则</strong>
                <p>
                  在 4x4 网格里填入 1 到 4。每一行和每一列都只能出现一次。点击空格后选数字，
                  错误输入会累计失误次数。
                </p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Puzzles</span>
                  <strong>{CABIN_SUDOKU_PUZZLES.length}</strong>
                  <p>每次开始会轮换到下一个 cabin grid。</p>
                </article>
                <article className="points-card">
                  <span>Points Formula</span>
                  <strong>{sudokuPoints}</strong>
                  <p>正确格子越多、失误越少，最终积分越高。</p>
                </article>
              </div>

              <button className="action-button action-button-primary" onClick={handleStart}>
                开始解题
              </button>
            </div>
          ) : null}

          {stage !== "briefing" && currentPuzzle ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>{currentPuzzle.title}</strong>
                <p>
                  当前已解出 {solvedCount} / {currentPuzzle.cells.length} 个格子，
                  失误 {mistakeCount} 次。
                </p>
              </div>

              <div className="cabin-puzzle-grid">
                {gridRows.flat().map((cell) => {
                  const currentValue = values[cell.id] ?? cell.initialValue;
                  const isSelected = selectedCellId === cell.id;

                  return (
                    <button
                      className="cabin-puzzle-tile"
                      disabled={stage !== "playing" || cell.initialValue !== null}
                      key={cell.id}
                      onClick={() => {
                        handleSelectCell(cell);
                      }}
                      type="button"
                    >
                      <span>
                        R{cell.row + 1} / C{cell.col + 1}
                      </span>
                      <strong>{currentValue ?? "?"}</strong>
                      <p>
                        {cell.initialValue !== null
                          ? "预填数字"
                          : isSelected
                            ? "已选中，选择下方数字"
                            : "点击后输入 1-4"}
                      </p>
                    </button>
                  );
                })}
              </div>

              {stage === "playing" ? (
                <div className="card-clash-hand">
                  {INPUT_OPTIONS.map((value) => (
                    <button
                      className="card-option accent-sea"
                      disabled={!selectedCellId}
                      key={value}
                      onClick={() => {
                        handleInput(value);
                      }}
                      type="button"
                    >
                      <span>Input</span>
                      <strong>{value}</strong>
                      <p>{selectedCellId ? `填入 ${selectedCellId}` : "先选择一个空格"}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {stage === "completed" && currentPuzzle ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>解题完成</strong>
                <p>
                  你已完成 {currentPuzzle.title}，最终失误 {mistakeCount} 次，
                  可将本局积分上报到积分中心。
                </p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Filled Cells</span>
                  <strong>{solvedCount}</strong>
                  <p>全部 {currentPuzzle.cells.length} 个格子已完成。</p>
                </article>
                <article className="points-card">
                  <span>Package Points</span>
                  <strong>{sudokuPoints}</strong>
                  <p>本局结束后可上报到积分中心。</p>
                </article>
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
