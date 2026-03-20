import { StaticHtmlGamePackagePage } from "./StaticHtmlGamePackagePage";

export function GlobeHextrisPackagePage() {
  return (
    <StaticHtmlGamePackagePage
      description="外部测试仓库接入的 Hextris 静态包，用于验证 canvas 类单机游戏在现有 iframe launcher 下的运行情况。"
      displayName="六边形俄罗斯方块"
      gameId="globe-hextris"
      notes={[
        "该包保留原始 canvas 渲染和本地 best score 存储。",
        "交付时作为单纯静态资产随 channel-web 镜像发布。"
      ]}
      staticPath="/globe-games-test/hextris/frontend/index.html"
    />
  );
}
