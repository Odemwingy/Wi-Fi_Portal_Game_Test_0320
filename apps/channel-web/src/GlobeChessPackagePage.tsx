import { StaticHtmlGamePackagePage } from "./StaticHtmlGamePackagePage";

export function GlobeChessPackagePage() {
  return (
    <StaticHtmlGamePackagePage
      description="外部测试仓库接入的国际象棋静态包，用于验证较重棋盘 DOM 页面在统一频道容器中的交付形态。"
      displayName="国际象棋"
      gameId="globe-chess"
      notes={[
        "保留原始前端实现，只补统一路由、启动上下文展示和 Docker 交付。",
        "该测试包当前不接 platform 房间和积分链路。"
      ]}
      staticPath="/globe-games-test/chess/frontend/index.html"
    />
  );
}
