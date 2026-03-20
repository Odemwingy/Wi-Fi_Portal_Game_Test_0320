# Globe Test Games Delivery

This repository integrates four external static test games from
[`Odemwingy/globe-games-test`](https://github.com/Odemwingy/globe-games-test)
into the existing Wi-Fi Portal delivery stack.

## Included Test Games

- `globe-2048` at `/games/globe-2048`
- `globe-chess` at `/games/globe-chess`
- `globe-hextris` at `/games/globe-hextris`
- `globe-sudoku` at `/games/globe-sudoku`

These games are delivered as static assets under
`apps/channel-web/public/globe-games-test/` and do not require separate backend
containers.

## Final Docker Delivery

Use the existing full-stack Compose delivery:

```bash
pnpm infra:stack:up
```

This starts:

- `redis` on `6379`
- `platform-api` on `3000`
- `channel-web` on `8080`

After startup, open:

- `http://127.0.0.1:8080/`
- `http://127.0.0.1:8080/games/globe-2048`
- `http://127.0.0.1:8080/games/globe-chess`
- `http://127.0.0.1:8080/games/globe-hextris`
- `http://127.0.0.1:8080/games/globe-sudoku`

Health checks:

- `http://127.0.0.1:3000/api/health`
- `http://127.0.0.1:3000/api/health/ready`

For a full acceptance runbook, see
[`docs/test-acceptance-checklist.md`](./test-acceptance-checklist.md).

## Notes

- The four imported games keep their original static frontend logic.
- Their local save / leaderboard behavior remains inside the imported mock SDK.
- This repository extends the catalog from `25` to `29` entries for integration
  testing and final packaging validation.
