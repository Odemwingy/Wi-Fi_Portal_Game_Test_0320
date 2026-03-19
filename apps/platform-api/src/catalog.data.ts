import {
  channelCatalogEntrySchema,
  channelConfigSchema,
  gamePackageMetadataSchema,
  type ChannelCatalogEntry,
  type ChannelConfig
} from "@wifi-portal/game-sdk";

const packageMetadata = [
  gamePackageMetadataSchema.parse({
    id: "quiz-duel",
    name: "Quiz Duel",
    version: "1.0.0",
    frontend: {
      route: "/games/quiz-duel",
      assetsPath: "/opt/games/quiz-duel/frontend"
    },
    server: {
      image: "registry.local/quiz-duel-server:1.0.0",
      port: 8080
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "cabin-puzzle",
    name: "Cabin Puzzle",
    version: "1.0.0",
    frontend: {
      route: "/games/cabin-puzzle",
      assetsPath: "/opt/games/cabin-puzzle/frontend"
    },
    server: {
      image: "registry.local/cabin-puzzle-server:1.0.0",
      port: 8090
    },
    realtime: {
      protocol: "sse"
    },
    dependencies: [],
    capabilities: ["single-player", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  })
];

export const buildChannelCatalog = (): ChannelCatalogEntry[] =>
  packageMetadata.map((metadata) =>
    channelCatalogEntrySchema.parse({
      game_id: metadata.id,
      display_name: metadata.name,
      description:
        metadata.id === "quiz-duel"
          ? "Fast head-to-head quiz battles for onboard LAN play."
          : "Single-player puzzle loops optimized for short sessions.",
      route: metadata.frontend.route,
      categories:
        metadata.id === "quiz-duel"
          ? ["Multiplayer", "Trivia", "Featured"]
          : ["Single Player", "Puzzle", "Relaxed"],
      capabilities: metadata.capabilities,
      points_enabled: metadata.capabilities.includes("points-reporting")
    })
  );

export const buildChannelConfig = (
  airlineCode: string,
  locale: string
): ChannelConfig =>
  channelConfigSchema.parse({
    airline_code: airlineCode,
    channel_name: `${airlineCode} Game Channel`,
    locale,
    hero_title: "Play lightweight games designed for onboard sessions.",
    sections: ["Featured", "Multiplayer", "Single Player", "Recently Added"],
    feature_flags: {
      points_enabled: true,
      multiplayer_lobby_enabled: true,
      airline_rewards_enabled: true
    }
  });
