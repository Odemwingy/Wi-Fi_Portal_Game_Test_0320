import { describe, expect, it } from "vitest";

import type { ChannelCatalogEntry, GameLaunchContext } from "@wifi-portal/game-sdk";

import {
  buildGamePackageLaunchSpec,
  buildGamePackageLaunchUrl,
  buildPortalHostUrl,
  getGamePackageLaunchMode
} from "./game-package-launcher";

const launchContext: GameLaunchContext = {
  airlineCode: "MU",
  cabinClass: "economy",
  locale: "zh-CN",
  passengerId: "passenger-1",
  seatNumber: "32A",
  sessionId: "sess-1"
};

const quizDuelEntry: ChannelCatalogEntry = {
  capabilities: ["multiplayer", "invite-code"],
  categories: ["Multiplayer"],
  description: "Quiz",
  display_name: "Quiz Duel",
  game_id: "quiz-duel",
  points_enabled: true,
  route: "/games/quiz-duel"
};

describe("game-package-launcher", () => {
  it("builds a launch url from route, session, trace, and room context", () => {
    const launchUrl = buildGamePackageLaunchUrl({
      baseUrl: "http://127.0.0.1:5173",
      gameId: "quiz-duel",
      launchContext,
      roomId: "room-1",
      route: "/games/quiz-duel",
      traceId: "trace-1"
    });

    expect(launchUrl).toBe(
      "http://127.0.0.1:5173/games/quiz-duel?game_id=quiz-duel&trace_id=trace-1&airline_code=MU&cabin_class=economy&locale=zh-CN&passenger_id=passenger-1&session_id=sess-1&seat_number=32A&room_id=room-1"
    );
  });

  it("marks quiz-duel as embedded and other games as iframe launches", () => {
    expect(getGamePackageLaunchMode("quiz-duel")).toBe("embedded");
    expect(getGamePackageLaunchMode("cabin-puzzle")).toBe("iframe");
  });

  it("builds a portal host url for iframe embedding contracts", () => {
    const portalUrl = buildPortalHostUrl({
      baseUrl: "http://127.0.0.1:5173",
      gameId: "cabin-puzzle",
      launchContext,
      roomId: null,
      route: "/games/cabin-puzzle",
      traceId: "trace-portal-1"
    });

    expect(portalUrl).toBe(
      "http://127.0.0.1:5173/portal/host?game_id=cabin-puzzle&route=%2Fgames%2Fcabin-puzzle&trace_id=trace-portal-1&airline_code=MU&cabin_class=economy&locale=zh-CN&passenger_id=passenger-1&session_id=sess-1&seat_number=32A"
    );
  });

  it("builds a stable launch spec for the selected package", () => {
    const spec = buildGamePackageLaunchSpec({
      baseUrl: "http://127.0.0.1:5173",
      entry: quizDuelEntry,
      launchContext,
      room: {
        created_at: "2026-03-19T00:00:00.000Z",
        game_id: "quiz-duel",
        host_player_id: "passenger-1",
        invite_code: "ROOM42",
        max_players: 4,
        players: [],
        reconnect_window_ms: 120000,
        room_id: "room-1",
        room_name: "Cabin Quiz Table",
        status: "waiting",
        updated_at: "2026-03-19T00:00:00.000Z"
      },
      traceId: "trace-2"
    });

    expect(spec).toMatchObject({
      displayName: "Quiz Duel",
      gameId: "quiz-duel",
      mode: "embedded",
      portalUrl:
        "http://127.0.0.1:5173/portal/host?game_id=quiz-duel&route=%2Fgames%2Fquiz-duel&trace_id=trace-2&airline_code=MU&cabin_class=economy&locale=zh-CN&passenger_id=passenger-1&session_id=sess-1&seat_number=32A&room_id=room-1",
      roomId: "room-1",
      route: "/games/quiz-duel",
      traceId: "trace-2"
    });
    expect(spec.url).toContain("trace_id=trace-2");
    expect(spec.url).toContain("room_id=room-1");
  });
});
