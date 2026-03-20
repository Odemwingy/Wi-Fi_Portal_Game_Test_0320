# Compatibility, Weak-Network, and E2E Test Strategy

## Goal

Provide a repeatable validation baseline for:

- passenger channel core flows
- realtime multiplayer flows
- weak-network and reconnect behavior
- pre-release compatibility checks for onboard WebView environments

## Automated Layers

### Unit and Integration

Run:

```bash
pnpm test
```

Current automated coverage includes:

- BFF bootstrap and catalog contracts
- room lifecycle and invite-code join
- realtime websocket message flow
- reconnect and room recovery basics
- points, leaderboard, rewards, inventory, and redemption rules
- platform diagnostics and metrics aggregation

### Docker Smoke

Run:

```bash
pnpm infra:backend:up
pnpm test:smoke
```

The smoke script validates:

- `GET /api/health`
- `GET /api/health/ready`
- `GET /api/metrics`
- session bootstrap for two passengers
- room creation and invite-code join
- guest ready flow
- host/guest websocket connect
- `quiz-duel` event relay and game-state broadcast
- disconnect and reconnect flow

### Browser Smoke

Run:

```bash
pnpm exec playwright install chromium
pnpm test:e2e:stack
```

The browser smoke validates:

- passenger homepage bootstrap and dashboard render
- direct route access via nginx SPA fallback
- admin channel login and published-content controls
- admin operations login and rules / airline config surfaces
- cross-origin browser access from `channel-web` (`:8080`) to `platform-api` (`:3000`)

## Browser and WebView Compatibility Matrix

Release candidates should be checked on at least:

| Platform | Runtime | Priority | Focus |
| --- | --- | --- | --- |
| iPhone / iPad | Safari + WKWebView | P0 | viewport, touch, websocket stability |
| Android phone | Chrome + Android System WebView | P0 | websocket stability, font/layout, resume from background |
| Android tablet | Android System WebView | P1 | responsive layout, touch hit area |
| macOS | Chrome / Safari | P1 | operator demo, regression sanity |

## Weak-Network Matrix

Validate these network profiles before release:

| Scenario | Expectation |
| --- | --- |
| stable onboard LAN | room, websocket, and game events stay consistent |
| 300-800ms latency spike | UI still receives state updates and no duplicate scoring occurs |
| transient websocket disconnect < reconnect window | player can reconnect without losing room membership |
| reconnect after socket close | room snapshot marks player disconnected, then connected again after reconnect |
| Redis restart or temporary unready dependency | `/api/health/ready` flips away from `ready` and rollback/runbook can be followed |

## Manual Core-Flow Checklist

### Passenger Channel

- bootstrap session and load channel homepage
- verify catalog entries, categories, and launch routes
- launch embedded `quiz-duel`
- launch iframe-style `cabin-puzzle`

### Multiplayer

- host creates room and sees invite code
- guest joins by invite code
- guest sets ready and room becomes ready
- both players receive `room_snapshot` and `game_state`
- host answers a question and guest sees updated state
- guest disconnects and host sees disconnected state
- guest reconnects within window and resumes room membership

### Points and Rewards

- game activity produces points summary changes
- leaderboard updates after point reports
- reward catalog loads
- redeemable reward reduces available points
- limited reward respects inventory and per-session limits

## Release Gate

A build is release-ready for current scope only when:

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:smoke`
- `pnpm test:e2e:stack`

all pass, and the manual compatibility matrix has no unresolved P0 findings.
