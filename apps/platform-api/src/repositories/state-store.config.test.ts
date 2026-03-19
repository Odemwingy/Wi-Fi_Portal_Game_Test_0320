import { describe, expect, it } from "vitest";

import { loadStateStoreConfig } from "./state-store.config";

describe("loadStateStoreConfig", () => {
  it("defaults to memory backend with a local redis URL fallback", () => {
    expect(loadStateStoreConfig({})).toEqual({
      backend: "memory",
      redis_url: "redis://127.0.0.1:6379"
    });
  });

  it("accepts redis backend from environment", () => {
    expect(
      loadStateStoreConfig({
        REDIS_URL: "redis://cache.internal:6379",
        STATE_STORE_BACKEND: "redis"
      })
    ).toEqual({
      backend: "redis",
      redis_url: "redis://cache.internal:6379"
    });
  });
});
