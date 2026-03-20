import { useEffect, useMemo, useState } from "react";

import {
  apiBaseUrl,
  getPassengerPointsSummary,
  reportPoints
} from "./channel-api";
import {
  usePackageLaunchContext
} from "./package-launch-context";

type PuzzleStage = "idle" | "playing" | "solved";

type PuzzleTile = {
  id: string;
  label: string;
  solvedIndex: number;
};

const SOLVED_TILES: PuzzleTile[] = [
  { id: "boarding", label: "Board", solvedIndex: 0 },
  { id: "stow", label: "Stow", solvedIndex: 1 },
  { id: "belt", label: "Belt", solvedIndex: 2 },
  { id: "mode", label: "Airplane", solvedIndex: 3 },
  { id: "briefing", label: "Briefing", solvedIndex: 4 },
  { id: "ready", label: "Ready", solvedIndex: 5 }
];

export function CabinPuzzlePackagePage() {
  const { launchContext } = usePackageLaunchContext("cabin-puzzle");
  const [tiles, setTiles] = useState<PuzzleTile[]>(() => shuffleTiles(SOLVED_TILES));
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [stage, setStage] = useState<PuzzleStage>("playing");
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const solvedCount = useMemo(
    () => tiles.filter((tile, index) => tile.solvedIndex === index).length,
    [tiles]
  );
  const puzzlePoints = useMemo(() => Math.max(8, 36 - moveCount * 2), [moveCount]);

  useEffect(() => {
    void getPassengerPointsSummary(launchContext.passengerId)
      .then((summary) => {
        setPointsSummary(summary);
      })
      .catch(() => {
        // Keep single-player package usable even if points summary is unavailable.
      });
  }, [launchContext.passengerId]);

  function handleSelectTile(tileId: string) {
    if (stage === "solved") {
      return;
    }

    if (!selectedTileId) {
      setSelectedTileId(tileId);
      return;
    }

    if (selectedTileId === tileId) {
      setSelectedTileId(null);
      return;
    }

    setTiles((current) => {
      const sourceIndex = current.findIndex((tile) => tile.id === selectedTileId);
      const targetIndex = current.findIndex((tile) => tile.id === tileId);

      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      const next = [...current];
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];

      const isSolved = next.every((tile, index) => tile.solvedIndex === index);
      setMoveCount((count) => count + 1);
      setSelectedTileId(null);
      setStage(isSolved ? "solved" : "playing");

      return next;
    });
  }

  function handleReset() {
    setTiles(shuffleTiles(SOLVED_TILES));
    setSelectedTileId(null);
    setMoveCount(0);
    setStage("playing");
  }

  async function handleReportPoints() {
    if (stage !== "solved") {
      return;
    }

    setIsReportingPoints(true);

    try {
      const response = await reportPoints({
        airline_code: launchContext.airlineCode,
        game_id: "cabin-puzzle",
        metadata: {
          move_count: moveCount,
          solved_tiles: solvedCount
        },
        passenger_id: launchContext.passengerId,
        points: puzzlePoints,
        reason: "cabin puzzle package solved",
        report_id: [
          "cabin-puzzle",
          launchContext.passengerId,
          launchContext.sessionId,
          moveCount
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
          <h1>Cabin Puzzle Package</h1>
          <p className="lede">
            这是单机 package 的独立页面版本。它从 launcher query 读取 session 上下文，
            不依赖房间状态，但能完整演示 package route 的启动形态。
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
              <span>Progress</span>
              <strong>
                {solvedCount}/{tiles.length}
              </strong>
              <p>{stage === "solved" ? "全部拼图已归位" : "交换 tile 完成顺序"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Puzzle Reward</span>
              <strong>{puzzlePoints}</strong>
              <p>完成后可回传到平台</p>
            </div>
          </div>

          <div className="launcher-actions">
            <button
              className="action-button action-button-primary"
              disabled={stage !== "solved" || isReportingPoints}
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
              <h2>Cabin Puzzle</h2>
            </div>
            <button className="action-button" onClick={handleReset} type="button">
              重新洗牌
            </button>
          </div>

          <section className="cabin-puzzle-stage">
            <div className="cabin-puzzle-summary">
                <div className="quiz-meta-card">
                  <span>目标</span>
                  <strong>按起飞准备顺序排列卡片</strong>
                  <p>Board / Stow / Belt / Airplane / Briefing / Ready</p>
                </div>
              <div className="quiz-meta-card">
                <span>Moves</span>
                <strong>{moveCount}</strong>
                <p>{stage === "solved" ? "已完成本轮 puzzle" : "继续交换直到全部归位"}</p>
              </div>
            </div>

            <div className="cabin-puzzle-grid">
              {tiles.map((tile, index) => {
                const isSelected = tile.id === selectedTileId;
                const isSolved = tile.solvedIndex === index;
                return (
                  <button
                    className={`cabin-puzzle-tile ${
                      isSelected ? "cabin-puzzle-tile-selected" : ""
                    } ${isSolved ? "cabin-puzzle-tile-solved" : ""}`}
                    key={tile.id}
                    onClick={() => {
                      handleSelectTile(tile.id);
                    }}
                    type="button"
                  >
                    <span>Step {index + 1}</span>
                    <strong>{tile.label}</strong>
                    <small>{isSolved ? "位置正确" : "点击与另一张交换"}</small>
                  </button>
                );
              })}
            </div>

            {stage === "solved" ? (
              <div className="launcher-callout">
                <div>
                  <p className="mini-label">Puzzle Solved</p>
                  <h3>Cabin Puzzle 已完成</h3>
                  <p>
                    单机 package 已经具备独立启动形态。下一步可以把积分上报和真实资源包加载接进来。
                  </p>
                </div>
              </div>
            ) : null}
          </section>
        </article>
      </section>
    </main>
  );
}

function shuffleTiles(source: PuzzleTile[]) {
  const tiles = [...source];
  for (let index = tiles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [tiles[index], tiles[swapIndex]] = [tiles[swapIndex], tiles[index]];
  }

  if (tiles.every((tile, index) => tile.solvedIndex === index)) {
    [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
  }

  return tiles;
}
