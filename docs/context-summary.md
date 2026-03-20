# 项目上下文摘要

## 1. 项目目标

本项目是机上 Wi-Fi Portal 内的统一游戏频道，采用统一的 `Game Channel + Game Platform + Game Packages` 架构，而不是为每款游戏单独建设一套系统。

当前代码基线已经覆盖：

- 统一频道首页、专区、推荐位、筛选和 package 启动链路
- Platform API、房间、邀请码、WebSocket、断线重连、房间清理
- 积分规则、事件采集、排行榜、权益兑换、航司积分适配
- 后台登录、RBAC、审计、频道配置、运营配置
- Docker Compose、健康检查、指标、结构化日志、测试方案

## 2. 当前交付状态

截至当前基线：

- 已落地游戏数：`25 / 25`
- 已落地联机游戏：`15`
- 已落地单机游戏：`10`
- GitHub open issues：`0`
- GitHub Project：feature / task / epic 已收敛为 `Done`

已落地的联机游戏：

- `quiz-duel`
- `word-rally`
- `memory-match-duel`
- `spot-the-difference-race`
- `mini-gomoku`
- `seat-map-strategy`
- `signal-scramble`
- `baggage-sort-showdown`
- `cabin-card-clash`
- `airline-trivia-teams`
- `tap-beat-battle`
- `route-builder-duel`
- `puzzle-race-grid`
- `skyline-defense-lite`
- `crew-coordination`

已落地的单机游戏：

- `cabin-puzzle`
- `runway-rush`
- `luggage-logic`
- `meal-cart-match`
- `window-view-memory`
- `flight-path-puzzler`
- `quiet-cabin-sudoku`
- `star-map-relax`
- `aircraft-fix-kit`
- `seat-upgrade-shuffle`

## 3. 仓库结构

- `apps/channel-web`
  - 乘客端频道、后台页面、各游戏 package 页面
- `apps/platform-api`
  - BFF、房间、联机 runtime、积分、航司、后台、可观测
- `packages/game-sdk`
  - metadata、BFF、联机、积分、权益、事件等共享合同
- `packages/shared-observability`
  - trace、结构化日志、错误模型
- `docs`
  - package 规范、rollout 计划、测试方案、发布手册、上下文和进度日志

## 4. 当前关键文档

- [game-package-spec.md](/Users/kale/Documents/Wi-Fi%20Portal%20Plan/Wi-Fi_Portal_Game_Channel_0319/repo/docs/game-package-spec.md)
- [game-rollout-plan.md](/Users/kale/Documents/Wi-Fi%20Portal%20Plan/Wi-Fi_Portal_Game_Channel_0319/repo/docs/game-rollout-plan.md)
- [test-strategy.md](/Users/kale/Documents/Wi-Fi%20Portal%20Plan/Wi-Fi_Portal_Game_Channel_0319/repo/docs/test-strategy.md)
- [release-playbook.md](/Users/kale/Documents/Wi-Fi%20Portal%20Plan/Wi-Fi_Portal_Game_Channel_0319/repo/docs/release-playbook.md)

## 5. Epic 收口状态

5 个 epic 已全部关闭。对应收口范围如下：

- Epic #1：monorepo / workspace / SDK 合同 / rollout 计划
- Epic #2：频道首页、推荐位、筛选、package launcher、后台内容驱动
- Epic #3：BFF、房间、邀请码、WebSocket、重连、cleanup、多款联机 runtime
- Epic #4：积分、权益、航司同步、后台登录、RBAC、审计、运营配置
- Epic #5：Docker Compose、Redis、观测、smoke、browser smoke、发布与回滚手册

## 6. 下一步

优先顺序建议：

1. 以 `pnpm release:check` 为统一本地发布门禁
2. 若进入实际上线阶段，再补真实部署环境参数、镜像发布和航司侧联调记录
