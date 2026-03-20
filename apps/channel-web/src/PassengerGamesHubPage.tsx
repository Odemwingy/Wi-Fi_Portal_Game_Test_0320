import { useMemo } from "react";

import { PassengerPortalShell } from "./PassengerPortalShell";
import { getGameAccent, getFilteredGames, usePassengerBootstrap } from "./passenger-portal";

const IMPORTED_GAME_IDS = new Set([
  "globe-2048",
  "globe-chess",
  "globe-hextris",
  "globe-sudoku"
]);

export function PassengerGamesHubPage() {
  const { apiError, bootstrapData, catalogEntries, isLoading } =
    usePassengerBootstrap();

  const importedGames = useMemo(
    () => getFilteredGames(catalogEntries, IMPORTED_GAME_IDS),
    [catalogEntries]
  );

  return (
    <PassengerPortalShell activePath="/portal/games" bootstrapData={bootstrapData}>
      <section className="portal-page-hero">
        <div>
          <p className="portal-kicker">Imported Test Games</p>
          <h2>测试游戏频道</h2>
          <p className="portal-copy">
            这个测试仓库只展示 4 款导入的静态游戏，用于验证 Wi-Fi Portal、
            游戏启动器和 Docker 最终交付链路。
          </p>
        </div>
        <div className="portal-stat-grid">
          <article className="portal-stat-card">
            <span>导入游戏</span>
            <strong>{importedGames.length}</strong>
          </article>
          <article className="portal-stat-card">
            <span>资源模式</span>
            <strong>static assets</strong>
          </article>
          <article className="portal-stat-card">
            <span>状态</span>
            <strong>{isLoading ? "loading" : "ready"}</strong>
          </article>
        </div>
      </section>

      {apiError ? (
        <section className="portal-banner portal-banner-error">
          <strong>测试频道加载失败：</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="portal-card-grid portal-game-grid">
        {importedGames.map((entry) => (
          <article className={`portal-game-card ${getGameAccent(entry)}`} key={entry.game_id}>
            <div className="portal-game-card-top">
              <span>{entry.categories.join(" · ")}</span>
              <strong>imported package</strong>
            </div>
            <h3>{entry.display_name}</h3>
            <p>{entry.description}</p>
            <div className="portal-tag-row">
              {entry.capabilities.map((capability) => (
                <span className="portal-tag" key={capability}>
                  {capability}
                </span>
              ))}
            </div>
            <a className="portal-secondary-link" href={entry.route}>
              开始测试
            </a>
          </article>
        ))}
      </section>
    </PassengerPortalShell>
  );
}
