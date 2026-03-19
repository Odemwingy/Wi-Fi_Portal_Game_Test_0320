import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { ChannelContentService } from "./channel-content.service";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import {
  ChannelContentRepository,
  StateStoreChannelContentRepository
} from "./repositories/channel-content.repository";

describe("ChannelContentService", () => {
  it("seeds default content and exposes a public catalog sorted by managed order", async () => {
    const repository: ChannelContentRepository = new StateStoreChannelContentRepository(
      new InMemoryJsonStateStore()
    );
    const service = new ChannelContentService(repository);
    const trace = startTrace();

    const content = await service.getChannelContent(trace, "MU", "zh-CN");
    const catalog = await service.getPublicCatalog(trace, "MU", "zh-CN");

    expect(content.catalog).toHaveLength(6);
    expect(catalog[0]).toMatchObject({
      categories: ["Featured", "Multiplayer", "Trivia"],
      game_id: "quiz-duel"
    });
  });

  it("persists hero and catalog visibility updates for subsequent bootstrap reads", async () => {
    const repository: ChannelContentRepository = new StateStoreChannelContentRepository(
      new InMemoryJsonStateStore()
    );
    const service = new ChannelContentService(repository);
    const trace = startTrace();
    const current = await service.getChannelContent(trace, "MU", "zh-CN");

    const updated = await service.updateChannelContent(trace, {
      catalog: current.catalog.map((entry, index) => ({
        categories: entry.game_id === "runway-rush" ? ["Reaction", "Recently Added"] : entry.categories,
        description:
          entry.game_id === "runway-rush"
            ? "Fresh single-player sprint promoted for the latest cabin playlist."
            : entry.description,
        featured: entry.game_id === "runway-rush" ? true : entry.featured,
        game_id: entry.game_id,
        sort_order: entry.game_id === "runway-rush" ? 0 : index + 1,
        status: entry.game_id === "cabin-puzzle" ? "hidden" : entry.status
      })),
      channel_config: {
        ...current.channel_config,
        hero_title: "Freshly configured from the admin console."
      }
    });

    const catalog = await service.getPublicCatalog(trace, "MU", "zh-CN");
    const channelConfig = await service.getPublicChannelConfig(trace, "MU", "zh-CN");

    expect(updated.channel_config.hero_title).toBe(
      "Freshly configured from the admin console."
    );
    expect(channelConfig.hero_title).toBe(
      "Freshly configured from the admin console."
    );
    expect(catalog.some((entry) => entry.game_id === "cabin-puzzle")).toBe(false);
    expect(catalog[0]).toMatchObject({
      categories: ["Featured", "Reaction", "Recently Added"],
      game_id: "runway-rush"
    });
  });
});
