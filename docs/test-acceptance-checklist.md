# Test Acceptance Checklist

This repository is the dedicated end-to-end test delivery repo for the Wi-Fi
Portal game stack and the four imported static test games.

## Scope

Included imported test games:

- `globe-2048`
- `globe-chess`
- `globe-hextris`
- `globe-sudoku`

Core services:

- `redis`
- `platform-api`
- `channel-web`

## Environment Preparation

Before running acceptance:

1. Install `pnpm`
2. Install and start Docker Desktop
3. Install Playwright Chromium once

```bash
pnpm install
pnpm exec playwright install chromium
```

## Standard Deployment Check

Run the local full-stack deployment:

```bash
pnpm infra:stack:up
```

Expected result:

- `redis` is healthy on `6379`
- `platform-api` is healthy on `3000`
- `channel-web` is healthy on `8080`

Verify with:

```bash
docker compose ps
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/health/ready
```

## Functional Acceptance

Passenger shell:

1. Open `http://127.0.0.1:8080/`
2. Confirm homepage loads normally
3. Confirm launcher area is visible

Admin pages:

1. Open `http://127.0.0.1:8080/admin/channel`
2. Log in with `super-admin / portal-super-123`
3. Confirm draft and publish controls load
4. Open `http://127.0.0.1:8080/admin/operations`
5. Confirm points rules and airline sync panels load

Imported static games:

1. Open `http://127.0.0.1:8080/games/globe-2048`
2. Confirm the wrapper page loads and the embedded game iframe is visible
3. Repeat for:
   - `http://127.0.0.1:8080/games/globe-chess`
   - `http://127.0.0.1:8080/games/globe-hextris`
   - `http://127.0.0.1:8080/games/globe-sudoku`

Static asset validation:

1. Open:
   - `http://127.0.0.1:8080/globe-games-test/2048/frontend/index.html`
   - `http://127.0.0.1:8080/globe-games-test/chess/frontend/index.html`
   - `http://127.0.0.1:8080/globe-games-test/hextris/frontend/index.html`
   - `http://127.0.0.1:8080/globe-games-test/sudoku/frontend/index.html`
2. Confirm each returns `200`

## Automated Validation

Quick validation:

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Full release-style gate:

```bash
pnpm delivery:check
```

Expected result:

- lint passes
- unit/integration tests pass
- build passes
- Docker full stack starts
- API smoke passes
- browser smoke passes

## Exit / Cleanup

Stop the stack:

```bash
pnpm infra:stack:down
```

If a full release gate was used, it stops the stack automatically after the run.
