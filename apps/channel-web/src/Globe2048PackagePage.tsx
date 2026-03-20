import { StaticHtmlGamePackagePage } from "./StaticHtmlGamePackagePage";

export function Globe2048PackagePage() {
  return (
    <StaticHtmlGamePackagePage
      description="外部测试仓库接入的 2048 静态包，用于验证 channel-web 对纯 HTML 单机游戏的整合与交付。"
      displayName="2048"
      gameId="globe-2048"
      notes={[
        "原始静态资源随前端镜像一起打包，不增加额外服务。",
        "游戏内排行榜和存档走外部包自带 mock SDK，本分支不改写其逻辑。"
      ]}
      staticPath="/globe-games-test/2048/frontend/index.html"
    />
  );
}
