import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Response } from "express";

import {
  createSpanId,
  createStructuredLogger,
  createTraceId
} from "@wifi-portal/shared-observability";

import type { TraceRequest } from "./http.types";
import { sharedPlatformMetricsService } from "./platform-metrics.service";

const logger = createStructuredLogger("platform-api");

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: TraceRequest, res: Response, next: NextFunction) {
    const traceId =
      typeof req.headers["x-trace-id"] === "string"
        ? req.headers["x-trace-id"]
        : createTraceId();

    const spanId = createSpanId();
    req.trace_context = { trace_id: traceId, span_id: spanId, parent_span_id: null };
    res.setHeader("x-trace-id", traceId);

    const startedAt = Date.now();

    logger.info("request.received", req.trace_context, {
      input_summary: `${req.method} ${req.originalUrl}`,
      metadata: {
        user_agent: req.headers["user-agent"] ?? null
      }
    });

    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const path = req.path || req.originalUrl.split("?")[0] || req.originalUrl;

      sharedPlatformMetricsService.recordHttpRequest({
        duration_ms: durationMs,
        method: req.method,
        path,
        status_code: res.statusCode
      });

      logger.info("request.completed", req.trace_context!, {
        duration_ms: durationMs,
        output_summary: `${res.statusCode}`,
        metadata: {
          method: req.method,
          path
        }
      });
    });

    next();
  }
}
