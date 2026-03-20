import { useMemo } from "react";

import { PassengerPortalShell } from "./PassengerPortalShell";
import { getFilteredGames, usePassengerBootstrap } from "./passenger-portal";

const IMPORTED_GAME_IDS = new Set([
  "globe-2048",
  "globe-chess",
  "globe-hextris",
  "globe-sudoku"
]);

const staticAssetRoutes = [
  "/globe-games-test/2048/frontend/index.html",
  "/globe-games-test/chess/frontend/index.html",
  "/globe-games-test/hextris/frontend/index.html",
  "/globe-games-test/sudoku/frontend/index.html"
];

export function PassengerMultiplayerPage() {
  const { apiError, bootstrapData, catalogEntries } = usePassengerBootstrap();
  const importedGames = useMemo(
    () => getFilteredGames(catalogEntries, IMPORTED_GAME_IDS),
    [catalogEntries]
  );

  return (
    <PassengerPortalShell
      activePath="/portal/multiplayer"
      bootstrapData={bootstrapData}
    >
      <section className="portal-page-hero">
        <div>
          <p className="portal-kicker">Delivery Assets</p>
          <h2>测试资源与直链</h2>
          <p className="portal-copy">
            这个仓库不以联机功能为重点，这一页改成测试资源中心，
            方便核对导入包路由、静态资源直链和页面装配状态。
          </p>
        </div>
        <div className="portal-stat-grid">
          <article className="portal-stat-card">
            <span>导入路由</span>
            <strong>{importedGames.length}</strong>
          </article>
          <article className="portal-stat-card">
            <span>静态直链</span>
            <strong>{staticAssetRoutes.length}</strong>
          </article>
          <article className="portal-stat-card">
            <span>交付模式</span>
            <strong>docker full stack</strong>
          </article>
        </div>
      </section>

      {apiError ? (
        <section className="portal-banner portal-banner-error">
          <strong>测试资源页加载失败：</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="portal-info-grid">
        <article className="portal-info-card">
          <p className="portal-kicker">Imported Routes</p>
          <h3>测试游戏入口</h3>
          <div className="portal-tag-row">
            {importedGames.map((entry) => (
              <a className="portal-tag" href={entry.route} key={entry.game_id}>
                {entry.display_name}
              </a>
            ))}
          </div>
        </article>

        <article className="portal-info-card">
          <p className="portal-kicker">Static Assets</p>
          <h3>HTML 直链</h3>
          <div className="portal-tag-row">
            {staticAssetRoutes.map((route) => (
              <a className="portal-tag" href={route} key={route}>
                {route}
              </a>
            ))}
          </div>
        </article>
      </section>
    </PassengerPortalShell>
  );
}
