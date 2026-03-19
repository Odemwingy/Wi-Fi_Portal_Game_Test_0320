import { describe, expect, it, vi } from "vitest";

import { InMemoryJsonStateStore } from "./json-state-store";

describe("InMemoryJsonStateStore", () => {
  it("supports prefix listing and TTL expiry semantics", async () => {
    vi.useFakeTimers();

    const store = new InMemoryJsonStateStore();
    await store.set("wifi-portal:room:room-1", { value: 1 }, { ttl_seconds: 10 });
    await store.set("wifi-portal:room:room-2", { value: 2 });
    await store.set("wifi-portal:game-state:quiz-duel:room-1", { value: 3 });

    expect(await store.list("wifi-portal:room:")).toEqual([
      "wifi-portal:room:room-1",
      "wifi-portal:room:room-2"
    ]);
    expect((await store.get<{ value: number }>("wifi-portal:room:room-1"))?.value).toBe(1);

    vi.advanceTimersByTime(10_001);

    expect(await store.get("wifi-portal:room:room-1")).toBeUndefined();
    expect(await store.list("wifi-portal:room:")).toEqual([
      "wifi-portal:room:room-2"
    ]);

    vi.useRealTimers();
  });
});
