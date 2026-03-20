import { StaticHtmlGamePackagePage } from "./StaticHtmlGamePackagePage";

export function GlobeSudokuPackagePage() {
  return (
    <StaticHtmlGamePackagePage
      description="外部测试仓库接入的数独静态包，用于验证输入型单机页面的触控和移动端适配交付。"
      displayName="数独"
      gameId="globe-sudoku"
      notes={[
        "原始难度切换、计时和提示逻辑保持不变。",
        "该包只需要前端容器即可运行，适合做最终交付部署验证。"
      ]}
      staticPath="/globe-games-test/sudoku/frontend/index.html"
    />
  );
}
