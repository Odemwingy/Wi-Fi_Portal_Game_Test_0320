import { describe, expect, it } from "vitest";

import { createStructuredLogger } from "./logger";
import { startTrace } from "./tracer";

describe("createStructuredLogger", () => {
  it("emits JSON-line friendly structured payloads", () => {
    const entries: unknown[] = [];
    const logger = createStructuredLogger("test-component", (entry) => {
      entries.push(entry);
    });

    logger.info("action.executed", startTrace(), {
      inputSummary: "payload",
      outputSummary: "ok"
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      trace_id: expect.any(String),
      span_id: expect.any(String),
      component: "test-component",
      action: "action.executed",
      level: "INFO",
      status: "success"
    });
  });
});
