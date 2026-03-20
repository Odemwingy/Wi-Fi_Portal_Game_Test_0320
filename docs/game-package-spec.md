# Game Package Spec

## Goals

- Keep game onboarding consistent across single-player and multiplayer titles.
- Make each game package independently deployable as an onboard containerized unit.
- Enforce the observability baseline from day one.

## Required Package Layout

```text
game-package/
  metadata.yaml
  frontend/
  server/
  config/
  health/
  docs/
```

## Required Metadata Fields

`metadata.yaml` must provide:

- `id`, `name`, `version`
- `frontend.route`, `frontend.assetsPath`
- `server.image`, `server.port`
- `realtime.protocol`
- `dependencies`
- `capabilities`
- `healthcheck.path`
- `observability.emitsStructuredLogs`
- `observability.supportsTraceContext`

The source of truth for validation is `packages/game-sdk/src/metadata.ts`.

## Launch Contract

All games receive a validated launch context:

```ts
type GameLaunchContext = {
  airlineCode: string;
  cabinClass: string;
  locale: string;
  passengerId: string;
  sessionId: string;
  seatNumber?: string;
};
```

The platform bootstrap BFF currently exposes:

- `POST /api/session/bootstrap`
- `GET /api/channel/config`
- `GET /api/channel/catalog`

These endpoints return validated payloads derived from the shared SDK schemas.

## Portal Embed Contract

For embedded Portal launches, the host shell uses `postMessage` to inject the
same launch context into the game iframe.

Current host route:

- `/portal/host`

Current bridge messages:

- host -> package: `portal.host.launch-context`
- package -> host: `portal.package.ready`
- package -> host: `portal.package.resize`

The canonical schemas live in:

- `packages/game-sdk/src/portal.ts`

Iframe packages should still support query-param launch as a fallback, but when
`portal_host=1` is present they must accept host-injected context and report
their height back to the shell.

## Event Contract

All multiplayer games emit the shared event envelope:

```ts
{
  type: "game_event",
  gameId: string,
  roomId: string,
  playerId: string,
  seq: number,
  payload: Record<string, unknown>
}
```

For `spot-the-difference-race`, the current low-frequency event payload is:

```ts
{
  spotId: string;
}
```

The platform resolves ownership server-side and rebroadcasts the updated `game_state`.

## Room Contract

The platform now exposes a shared lobby API:

- `POST /api/lobby/create-room`
- `POST /api/lobby/join-room`
- `POST /api/lobby/leave-room`
- `POST /api/lobby/set-ready`
- `POST /api/lobby/reconnect`
- `POST /api/lobby/disconnect`
- `GET /api/lobby/rooms/:roomId`
- `GET /api/contracts/realtime`

The canonical payloads and response schemas live in:

- `packages/game-sdk/src/multiplayer.ts`

## Points Contract

The platform now exposes a shared points reporting API:

- `POST /api/points/report`
- `GET /api/points/passengers/:passengerId`
- `GET /api/points/leaderboard?limit=6`
- `GET /api/points/audit?passenger_id=...&limit=20`

Each package report must include:

- `report_id` for idempotent replay protection
- `game_id`, `passenger_id`, `session_id`
- awarded `points`
- a short `reason`
- optional `airline_code` to trigger the airline sync adapter layer
- optional `room_id`
- optional structured `metadata`

The canonical payloads and summary schemas live in:

- `packages/game-sdk/src/points.ts`
- `packages/game-sdk/src/airline-points.ts`

The platform now also exposes an admin-only airline sync surface:

- `GET /api/admin/airline-points/config?airline_code=MU`
- `PUT /api/admin/airline-points/config`
- `GET /api/admin/airline-points/sync-records?airline_code=MU&status=failed`
- `POST /api/admin/airline-points/dispatch-pending`
- `POST /api/admin/airline-points/sync-records/:syncId/retry`

This layer is intentionally modeled as an outbox:

- internal passenger points are still written first
- airline sync records are keyed by an idempotency identity derived from `airline_code/session_id/passenger_id/report_id`
- `realtime` configs attempt sync during the report call
- `batch` configs queue a pending record until manual or scheduled dispatch
- failures are persisted with `attempt_count`, `last_error`, and `next_retry_at`

The platform now also exposes a configurable points rules surface:

- `GET /api/admin/points-rules/config?airline_code=MU&game_id=quiz-duel`
- `PUT /api/admin/points-rules/config`
- `GET /api/admin/points-rules/audit?passenger_id=...&game_id=...`

Rule sets are evaluated server-side during `POST /api/points/report`:

- default behavior preserves the current passthrough award amount
- optional rules can add duration bonus, result bonus, room bonus, or flat entry bonus
- each report returns an `audit_entry` with `applied_rule_ids`, `requested_points`, `awarded_points`, and a per-rule breakdown
- rule sets can enforce `max_points_per_report` caps without trusting the package client

## Rewards Contract

The platform now exposes a shared airline rewards API:

- `GET /api/rewards/catalog?airline_code=MU&locale=zh-CN`
- `GET /api/rewards/passengers/:passengerId/wallet?airline_code=MU`
- `POST /api/rewards/redeem`

Reward redemptions are intentionally modeled separately from earned points:

- `earned_points` remains the total reported by game packages
- `redeemed_points` tracks confirmed reward redemptions
- `available_points = earned_points - redeemed_points`
- redemption records now carry `status`, `fulfillment_type`, optional `fulfillment_code`, and `fulfillment_instructions`
- limited rewards now expose `inventory_remaining` and `redemption_limit_per_session`, enforced against the current session as the onboard segment boundary

The canonical schemas live in:

- `packages/game-sdk/src/rewards.ts`

## Realtime Contract

Realtime room traffic is now carried over:

- `WS /ws/game-room`

Required connection query:

- `trace_id`
- `room_id`
- `player_id`
- `session_id`

Client message types:

- `game_state_request`
- `room_snapshot_request`
- `room_presence`
- `game_event`

Server message types:

- `game_state`
- `room_snapshot`
- `room_presence`
- `game_event`
- `ack`
- `error`

Current platform behavior:

- A successful WebSocket connection immediately receives a `room_snapshot`.
- A successful WebSocket connection also receives the current `game_state` when the game has a registered runtime adapter.
- Room membership and ready-state changes are rebroadcast as `room_snapshot`.
- Disconnect and reconnect events emit both `room_snapshot` and `room_presence`.
- `game_event` is applied by the registered game adapter, then broadcasts both `game_event` and the updated `game_state`, and is acknowledged to the sender.

## Scene Pack Contract

Scene-driven packages may ship a shared static scene pack and reuse it across single-player and multiplayer modes.

The current `spot-the-difference-race` scene pack lives in:

- `packages/game-sdk/src/spot-the-difference.ts`

Recommended scene fields:

- `scene.id`
- `scene.title`
- `scene.timeLimitSeconds`
- `scene.leftCaption`
- `scene.rightCaption`
- `scene.spots[]`

Each `spot` uses relative coordinates so the same package can render on different onboard WebView sizes:

- `id`
- `label`
- `x`
- `y`
- `radius`

Current runtime pattern:

- single-player mode reuses the same scene pack with local state only
- multiplayer mode reuses the same scene pack but sources progress from server `game_state`
- websocket traffic carries only low-frequency spot-claim events, not pointer streams or frame sync

## State Storage Contract

Current repository implementations are backed by a shared JSON state store abstraction, with Redis-compatible key and TTL rules:

- room snapshot key: `wifi-portal:room:{roomId}`
- quiz-duel runtime key: `wifi-portal:game-state:quiz-duel:{roomId}`
- default TTL: `7200` seconds for both room and runtime state
- backend selector: `STATE_STORE_BACKEND=memory|redis`
- Redis connection: `REDIS_URL=redis://host:6379`

The current default backend is in-memory, but the repository layer is now written so the backing store can be swapped to Redis without changing `RoomService`, realtime handling, or game adapters.

## Adapter Boundary

Each game server must implement:

- `createMatch()`
- `joinMatch()`
- `handlePlayerAction()`
- `getSnapshot()`
- `reconnectPlayer()`
- `finishMatch()`

## Observability Requirements

Every game package must:

- accept inbound `trace_id` from the platform launch context or headers
- create child spans for server-side match actions
- emit structured JSON logs for launch, room join, action handling, and match finish
- avoid raw `print` or ad hoc text logs

## Current Implementation Artifacts

- Schema: `packages/game-sdk/src/metadata.ts`
- Shared contracts: `packages/game-sdk/src/contracts.ts`
- Multiplayer schemas: `packages/game-sdk/src/multiplayer.ts`
- Platform room repository abstraction: `apps/platform-api/src/repositories/room.repository.ts`
- Sample game-state repository abstraction: `apps/platform-api/src/repositories/quiz-duel-state.repository.ts`
- Additional scene-pack example: `packages/game-sdk/src/spot-the-difference.ts`
- Example metadata: `examples/game-packages/quiz-duel/metadata.yaml`
