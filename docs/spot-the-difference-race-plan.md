# Spot the Difference Race 接入预研

## 1. 目标

把 `spot-the-difference-race` 收成可以直接进入编码的 Wave B 输入，而不是停留在玩法名词层。

需要回答四个问题：

- 单机模式和双人竞速模式是否共用同一套素材和页面骨架
- 联机是否需要新的实时协议，还是复用现有 room + websocket + game_event
- 服务端需要维护哪些最小状态，才能支持弱网和断线恢复
- package metadata、adapter、前端页面应该如何落到当前 monorepo

## 2. 玩法拆解

### 2.1 单机模式

- 乘客进入一张对比图，目标是在限定时间内找出 `5-7` 处差异点
- 前端本地维护点击、命中、剩余时间和结束结算
- 平台只需要接收 `start`、`complete`、`score`、`duration_ms` 这类积分事件
- 单机模式不依赖房间，也不依赖 websocket

### 2.2 双人竞速模式

- 两位乘客进入同一题面，争夺同一组差异点
- 每次命中一个差异点就立刻上分，并从共享题面中标记为已发现
- 同一个差异点只能被第一个命中的乘客占有，后续点击视为重复点击
- 局结束条件取三者之一：
  - 全部差异点都已被发现
  - 任一方先达到多数差异点
  - 倒计时结束

结论：

- 单机和联机可以共用同一套 scene pack、热点定义、渲染层和结果页
- 区别只在于状态来源：
  - 单机：本地 state
  - 联机：服务端快照 + 低频实时事件

## 3. 同步模型

### 3.1 不采用逐帧同步

这个游戏不需要高频实时同步，不应该引入新的实时模型。

原因：

- 玩家核心动作只有“点击某个热点”
- 争议状态只有“某个差异点是否已被占有”
- 每次命中都可以离散成一个事件
- 现有 `game_event -> adapter -> game_state -> websocket broadcast` 已经足够

### 3.2 采用低频命中事件同步

推荐事件：

```json
{
  "type": "game_event",
  "payload": {
    "spotId": "window-shade-03",
    "x": 0.42,
    "y": 0.37
  }
}
```

服务端适配器负责：

- 校验 `spotId` 是否存在于当前 scene
- 判断该差异点是否已被其他玩家占有
- 记录命中玩家、命中时间和累计分数
- 生成最新 `game_state`

广播给客户端的核心状态：

- `scene_id`
- `found_spots`
- `scores`
- `remaining_spot_count`
- `deadline_at`
- `winner_player_ids`
- `is_completed`
- `recent_claim`

## 4. 弱网与恢复策略

### 4.1 服务端最小真相源

联机模式下，服务端需要持久化这些字段：

- 当前 scene id
- 全部 spot 定义的 id 列表
- 已命中的 `spot_id -> player_id`
- 当前分数
- 最近事件序号 `lastSeqByPlayer`
- 倒计时截止时间 `deadline_at`
- 完赛标记和胜者

这套状态天然适合放进现有 Redis/JsonStateStore，不需要额外引入数据库。

### 4.2 断线恢复

恢复时客户端只需要重新请求：

- `room_snapshot`
- `game_state`

然后用服务端快照重建：

- 哪些差异点已经被发现
- 当前剩余时间
- 哪位玩家领先

因为没有逐帧动画依赖，所以重连恢复成本低。

## 5. Scene Pack 资源方案

### 5.1 资源结构

建议把题面抽成静态 `scene pack`，每关一个 JSON：

```text
scene-pack/
  cabin-window-evening/
    left.webp
    right.webp
    scene.json
```

`scene.json` 最小字段建议：

- `scene_id`
- `title`
- `difficulty`
- `time_limit_seconds`
- `spots[]`

每个 `spot` 建议字段：

- `id`
- `x`
- `y`
- `radius`
- `label`

其中 `x/y/radius` 用相对坐标，避免终端尺寸适配时重新算绝对像素。

### 5.2 资源约束

为符合机上场景，建议约束：

- 单关左右图合计控制在 `300-500 KB`
- 默认优先 `webp`
- 单关差异点控制在 `5-7` 个
- 单局时长控制在 `90-120` 秒
- 首发阶段只做静态图，不做视频帧找不同

## 6. 前端渲染边界

前端 package 需要三块 UI：

- 题面区：左右图并排，支持热点点击和高亮
- 进度区：剩余时间、已发现数量、双方比分
- 结果区：胜负、命中记录、积分回传结果

前端不负责的部分：

- 联机胜负裁定
- 差异点归属冲突判定
- 重连后的状态合并

这些都应由 adapter 输出的 `game_state` 驱动。

## 7. 建议的 monorepo 落点

### 7.1 platform-api

新增：

- `apps/platform-api/src/game-adapters/spot-the-difference-race.adapter.ts`
- `apps/platform-api/src/repositories/spot-the-difference-race-state.repository.ts`

并修改：

- `apps/platform-api/src/game-runtime.service.ts`
- `apps/platform-api/src/app.module.ts`
- `apps/platform-api/src/catalog.data.ts`

### 7.2 channel-web

新增：

- `apps/channel-web/src/SpotTheDifferenceRacePackagePage.tsx`
- `apps/channel-web/src/spot-the-difference-runtime.tsx`
- `apps/channel-web/src/spot-the-difference-runtime-state.ts`

并修改：

- `apps/channel-web/src/main.tsx`

### 7.3 docs

需要同步：

- `docs/game-rollout-plan.md`
- `docs/game-package-spec.md`

## 8. package metadata 建议

建议 metadata 先按联机形态注册：

- `id`: `spot-the-difference-race`
- `route`: `/games/spot-the-difference-race`
- `capabilities`:
  - `multiplayer`
  - `leaderboard`
  - `invite-code`
  - `points-reporting`

单机模式不单独拆一个 package，而是在同一个 package 内根据 launch context 或模式开关降级运行。

原因：

- 素材和 UI 完全复用
- 运营侧只需要维护一套内容
- 后续若需要单机兜底，可以在房间不可用时退化到 solo mode

## 9. 事件与积分建议

### 9.1 联机事件

- `game.start`
- `spot.claimed`
- `spot.duplicate_click`
- `game.complete`

### 9.2 计分规则

建议首版简单化：

- 命中一个新差异点：`+8`
- 重复点击：`0`
- 获胜奖励：`+12`
- 完赛参与奖励：`+6`

平台最终对外上报仍然使用聚合后的 `points report`，不要把每个命中都直接写进积分中心。

## 10. 推荐实现顺序

1. 先落 scene pack 和 runtime state parser
2. 再落 platform adapter 与 repository
3. 接入独立 package 页面和 websocket
4. 最后补单机 fallback 与题库扩展

## 11. 结论

`spot-the-difference-race` 适合进入下一轮实现，结论如下：

- 复用现有 room + websocket + game_event 模型，不需要新协议
- 单机与联机共用一套 scene pack 和 package 页面
- 服务端只维护“差异点归属 + 分数 + 截止时间”这类低频状态
- 可以直接按当前 monorepo 结构落成第 6 款验证游戏
