import { useEffect, useMemo, useState } from "react";

import type {
  SessionBootstrapResponse
} from "@wifi-portal/game-sdk";

import { bootstrapSession } from "./channel-api";
import { buildGamePackageLaunchSpec } from "./game-package-launcher";

const DEFAULT_BOOTSTRAP = {
  airline_code: "MU",
  cabin_class: "economy",
  locale: "zh-CN",
  seat_number: "32A"
} as const;

const IMPORTED_GAME_IDS = new Set([
  "globe-2048",
  "globe-chess",
  "globe-hextris",
  "globe-sudoku"
]);

export function PassengerChannelPage() {
  const [bootstrapData, setBootstrapData] =
    useState<SessionBootstrapResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGameId, setSelectedGameId] = useState<string>("globe-2048");

  useEffect(() => {
    setIsLoading(true);
    setApiError(null);

    void bootstrapSession(DEFAULT_BOOTSTRAP)
      .then((response) => {
        setBootstrapData(response);

        const importedGames = response.catalog.filter((entry) =>
          IMPORTED_GAME_IDS.has(entry.game_id)
        );

        setSelectedGameId(importedGames[0]?.game_id ?? response.catalog[0]?.game_id ?? "");
      })
      .catch((error: unknown) => {
        setApiError(error instanceof Error ? error.message : "频道初始化失败");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const importedGames = useMemo(() => {
    const catalog = bootstrapData?.catalog ?? [];
    return catalog.filter((entry) => IMPORTED_GAME_IDS.has(entry.game_id));
  }, [bootstrapData?.catalog]);

  const selectedGame =
    importedGames.find((entry) => entry.game_id === selectedGameId) ??
    importedGames[0] ??
    null;

  const selectedLaunchUrl = useMemo(() => {
    if (!bootstrapData || !selectedGame) {
      return "#";
    }

    return buildGamePackageLaunchSpec({
      baseUrl: window.location.origin,
      entry: selectedGame,
      launchContext: bootstrapData.session,
      room: null,
      traceId: bootstrapData.trace_id
    }).url;
  }, [bootstrapData, selectedGame]);

  return (
    <main className="shell">
      <section className="hero-panel passenger-hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Passenger Game Channel</p>
          <h1>欢迎进入机上游戏频道</h1>
          <p className="lede">
            这是面向乘客的频道首页。当前测试仓库重点开放 4 款静态单机游戏，
            用于验证频道入口、游戏启动和最终部署交付。
          </p>
        </div>

        <div className="hero-stats">
          <article className="stat-chip accent-sea">
            <span>Channel</span>
            <strong>{bootstrapData?.channel_config.channel_name ?? "Loading..."}</strong>
          </article>
          <article className="stat-chip accent-sun">
            <span>Seat</span>
            <strong>{bootstrapData?.session.seatNumber ?? DEFAULT_BOOTSTRAP.seat_number}</strong>
          </article>
          <article className="stat-chip accent-mint">
            <span>Games</span>
            <strong>{importedGames.length || 4} imported test games</strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Mode</span>
            <strong>static single-player</strong>
          </article>
        </div>
      </section>

      {apiError ? (
        <section className="banner banner-error">
          <strong>频道加载失败：</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="dashboard">
        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Featured Games</p>
              <h2>本次测试的 4 款游戏</h2>
            </div>
            <a className="action-button" href="/lab/channel">
              打开技术实验页
            </a>
          </div>

          <div className="discover-grid">
            <section className="discover-hero-card">
              <p className="mini-label">Today&apos;s spotlight</p>
              <h3>{selectedGame?.display_name ?? "正在加载频道游戏..."}</h3>
              <p>
                {selectedGame?.description ??
                  "频道会在初始化完成后展示导入测试游戏的卡片和启动入口。"}
              </p>
              <div className="launcher-actions">
                <a
                  className="action-button action-button-primary"
                  href={selectedLaunchUrl}
                >
                  立即开始
                </a>
                <a className="action-button" href="/games/globe-2048">
                  快速测试入口
                </a>
              </div>
            </section>

            <section className="discover-rail">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Imported Catalog</p>
                  <h2>频道游戏卡片</h2>
                </div>
                <span className="pill">{isLoading ? "loading" : "ready"}</span>
              </div>

              <div className="discover-list">
                {importedGames.map((entry) => (
                  <button
                    className="discover-tile"
                    key={entry.game_id}
                    onClick={() => {
                      setSelectedGameId(entry.game_id);
                    }}
                    type="button"
                  >
                    <span className="mini-label">{entry.categories.join(" / ")}</span>
                    <strong>{entry.display_name}</strong>
                    <p>{entry.description}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Current Passenger</p>
              <h2>本次启动上下文</h2>
            </div>
          </div>

          <div className="launcher-meta-grid">
            <div className="quiz-meta-card">
              <span>Passenger</span>
              <strong>{bootstrapData?.session.passengerId ?? "loading"}</strong>
              <p>当前默认乘客身份</p>
            </div>
            <div className="quiz-meta-card">
              <span>Locale</span>
              <strong>{bootstrapData?.session.locale ?? DEFAULT_BOOTSTRAP.locale}</strong>
              <p>{bootstrapData?.session.airlineCode ?? DEFAULT_BOOTSTRAP.airline_code}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Cabin</span>
              <strong>{bootstrapData?.session.cabinClass ?? DEFAULT_BOOTSTRAP.cabin_class}</strong>
              <p>默认旅客测试参数</p>
            </div>
            <div className="quiz-meta-card">
              <span>Trace</span>
              <strong>{bootstrapData?.trace_id ?? "pending"}</strong>
              <p>用于完整链路排查</p>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Launch Routes</p>
              <h2>直达游戏入口</h2>
            </div>
          </div>

          <div className="activity-list">
            {importedGames.map((entry) => (
              <article className="activity-item tone-info" key={entry.game_id}>
                <div className="activity-topline">
                  <strong>{entry.display_name}</strong>
                  <span>{entry.route}</span>
                </div>
                <p>{entry.capabilities.join(", ")}</p>
              </article>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
