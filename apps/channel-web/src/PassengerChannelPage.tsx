import { useEffect, useMemo, useState } from "react";

import { PassengerPortalShell } from "./PassengerPortalShell";
import { buildGamePackageLaunchSpec } from "./game-package-launcher";
import { getFilteredGames, getGameAccent, usePassengerBootstrap } from "./passenger-portal";

const IMPORTED_GAME_IDS = new Set([
  "globe-2048",
  "globe-chess",
  "globe-hextris",
  "globe-sudoku"
]);

export function PassengerChannelPage() {
  const { apiError, bootstrapData, catalogEntries, isLoading } =
    usePassengerBootstrap();
  const [selectedGameId, setSelectedGameId] = useState("");

  const importedGames = useMemo(
    () => getFilteredGames(catalogEntries, IMPORTED_GAME_IDS),
    [catalogEntries]
  );

  useEffect(() => {
    if (!selectedGameId && importedGames[0]) {
      setSelectedGameId(importedGames[0].game_id);
    }
  }, [importedGames, selectedGameId]);

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
    <PassengerPortalShell activePath="/" bootstrapData={bootstrapData}>
      <section className="portal-home-hero">
        <div>
          <p className="portal-kicker">Welcome Aboard</p>
          <h2>欢迎进入机上游戏频道</h2>
          <p className="portal-home-copy">
            这个测试仓库的乘客页同样采用参考稿的 Portal 风格，但内容收敛到
            4 款导入测试游戏，用于验证首页、频道列表、静态资源和最终 Docker
            交付是否完整可用。
          </p>
        </div>

        <div className="portal-stat-grid">
          <article className="portal-stat-card">
            <span>测试频道</span>
            <strong>{bootstrapData?.channel_config.channel_name ?? "Loading..."}</strong>
          </article>
          <article className="portal-stat-card">
            <span>座位</span>
            <strong>{bootstrapData?.session.seatNumber ?? "32A"}</strong>
          </article>
          <article className="portal-stat-card">
            <span>导入游戏</span>
            <strong>{importedGames.length || 4}</strong>
          </article>
        </div>
      </section>

      {apiError ? (
        <section className="portal-banner portal-banner-error">
          <strong>测试频道加载失败：</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="portal-quick-grid">
        <a className="portal-quick-card" href="/portal/games">
          <span className="portal-quick-card-meta">Quick Access</span>
          <strong>测试游戏</strong>
          <p>集中查看 4 款导入测试游戏与启动入口。</p>
        </a>
        <a className="portal-quick-card" href="/portal/multiplayer">
          <span className="portal-quick-card-meta">Assets</span>
          <strong>测试资源</strong>
          <p>核对直达路由、静态 HTML 资源和交付清单。</p>
        </a>
        <a className="portal-quick-card" href="/portal/flight-info">
          <span className="portal-quick-card-meta">Flight</span>
          <strong>飞行信息</strong>
          <p>在同一 Portal 壳中验证乘客上下文显示。</p>
        </a>
        <a className="portal-quick-card" href={selectedLaunchUrl}>
          <span className="portal-quick-card-meta">Start Now</span>
          <strong>{selectedGame?.display_name ?? "导入游戏"}</strong>
          <p>直接跳入当前选中的测试游戏页面。</p>
        </a>
      </section>

      <section className="portal-home-grid">
        <article className={`portal-spotlight ${selectedGame ? getGameAccent(selectedGame) : ""}`}>
          <div className="portal-feature-topline">
            <span>Today&apos;s Spotlight</span>
            <strong>{isLoading ? "loading" : "ready"}</strong>
          </div>
          <h3>{selectedGame?.display_name ?? "正在准备测试频道"}</h3>
          <p>
            {selectedGame?.description ??
              "Portal 完成初始化后，会在这里展示导入测试游戏与最快的进入入口。"}
          </p>
          <div className="portal-tag-row">
            {(selectedGame?.categories ?? []).slice(0, 4).map((item) => (
              <span className="portal-tag" key={item}>
                {item}
              </span>
            ))}
          </div>
          <div className="portal-feature-actions">
            <a className="portal-primary-link" href={selectedLaunchUrl}>
              立即开始
            </a>
            <a className="portal-secondary-link" href="/portal/games">
              查看全部测试游戏
            </a>
          </div>
        </article>

        <article className="portal-rail">
          <div className="portal-section-head">
            <div>
              <p className="portal-kicker">Imported Picks</p>
              <h3>本次测试的 4 款游戏</h3>
            </div>
            <span className="portal-status-text">{importedGames.length} picks</span>
          </div>
          <div className="portal-rail-list">
            {importedGames.map((entry) => (
              <button
                className="portal-rail-button"
                key={entry.game_id}
                onClick={() => {
                  setSelectedGameId(entry.game_id);
                }}
                type="button"
              >
                <strong>{entry.display_name}</strong>
                <p>{entry.description}</p>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="portal-info-grid">
        <article className="portal-info-card">
          <p className="portal-kicker">Delivery Scope</p>
          <h3>测试交付目标</h3>
          <div className="portal-tag-row">
            <span className="portal-tag">portal shell</span>
            <span className="portal-tag">launcher route</span>
            <span className="portal-tag">static import</span>
            <span className="portal-tag">docker delivery</span>
          </div>
        </article>
        <article className="portal-info-card">
          <p className="portal-kicker">Test Ready</p>
          <h3>推荐验证入口</h3>
          <div className="portal-tag-row">
            {importedGames.map((entry) => (
              <a className="portal-tag" href={entry.route} key={entry.game_id}>
                {entry.display_name}
              </a>
            ))}
          </div>
        </article>
      </section>
    </PassengerPortalShell>
  );
}
