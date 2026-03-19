import type { Request } from "express";

import type { TraceContext } from "@wifi-portal/shared-observability";

export type TraceRequest = Request & {
  trace_context?: TraceContext;
};
