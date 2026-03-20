# Release and Rollback Playbook

## Release Inputs

- Docker image tag: set `RELEASE_VERSION`
- State backend: set `STATE_STORE_BACKEND=redis`
- Redis endpoint: set `REDIS_URL`

## Recommended Release Flow

1. Run `pnpm release:check`.
2. Build and publish the target images with the release tag.
3. Update the deployment environment to the new image tag and `RELEASE_VERSION`.
4. Start the stack with `docker compose up -d --build`.
5. Verify:
   - `GET /api/health`
   - `GET /api/health/ready`
   - `GET /api/metrics`
   - `WS /ws/game-room`
6. Watch structured logs for `request.completed`, `room.*`, `realtime.*`, `points.*`, and `rewards.*`.

`pnpm release:check` currently covers:

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- Docker Compose startup for `redis`, `platform-api`, and `channel-web`
- `pnpm test:smoke`
- Playwright browser smoke for `/`, `/admin/channel`, and `/admin/operations`

## Rollback Rules

- Roll back immediately when `GET /api/health/ready` is not `ready`.
- Roll back when `websocket.active_connections` drops unexpectedly after release.
- Roll back when `http.status_counts.5xx` rises or `websocket.avg_rtt_ms_1m` degrades materially.

## Rollback Steps

1. Change the deployed image tag back to the previous known-good version.
2. Set `RELEASE_VERSION` to the same previous tag.
3. Re-run `docker compose up -d`.
4. Confirm `GET /api/health/ready` returns `ready`.
5. Confirm `GET /api/metrics` shows recovering request and websocket behavior.

## Notes

- Frontend static asset rollback should follow the same version tag as the API release.
- Redis data is shared state. Roll back code first; avoid destructive cache flushes unless a data migration explicitly requires it.
