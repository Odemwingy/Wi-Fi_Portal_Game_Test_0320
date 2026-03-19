import type { Request } from "express";

import type {
  AdminSession,
  AdminUser
} from "@wifi-portal/game-sdk";
import type { TraceContext } from "@wifi-portal/shared-observability";

export type TraceRequest = Request & {
  admin_context?: {
    session: AdminSession;
    user: AdminUser;
  };
  trace_context?: TraceContext;
};
