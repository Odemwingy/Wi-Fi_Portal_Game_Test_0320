import { describe, expect, it } from "vitest";

import { parseGamePackageMetadata } from "./metadata";

describe("parseGamePackageMetadata", () => {
  it("parses a valid multiplayer package definition", () => {
    const metadata = parseGamePackageMetadata(`
id: quiz-duel
name: Quiz Duel
version: 1.0.0
frontend:
  route: /games/quiz-duel
  assetsPath: /opt/games/quiz-duel/frontend
server:
  image: registry.local/quiz-duel-server:1.0.0
  port: 8080
realtime:
  protocol: websocket
dependencies:
  - redis
capabilities:
  - multiplayer
  - leaderboard
healthcheck:
  path: /health
observability:
  emitsStructuredLogs: true
  supportsTraceContext: true
`);

    expect(metadata.id).toBe("quiz-duel");
    expect(metadata.capabilities).toContain("multiplayer");
  });
});
