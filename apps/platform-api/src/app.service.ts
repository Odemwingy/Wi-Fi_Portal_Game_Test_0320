import { BadRequestException, Injectable } from "@nestjs/common";

import {
  buildGameLaunchContext,
  sessionBootstrapRequestSchema,
  sessionBootstrapResponseSchema,
  type GamePackageMetadata,
  type SessionBootstrapRequest,
  type SessionBootstrapResponse
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import { buildChannelCatalog, buildChannelConfig } from "./catalog.data";

const logger = createStructuredLogger("platform-api.bff");

@Injectable()
export class AppService {
  getGamePackageContract(): Pick<
    GamePackageMetadata,
    "id" | "name" | "version" | "capabilities"
  > {
    return {
      id: "sample-game-package",
      name: "Sample Game Package",
      version: "0.1.0",
      capabilities: ["multiplayer", "leaderboard"]
    };
  }

  getChannelConfig(
    traceContext: TraceContext,
    airlineCode: string,
    locale = "en-US"
  ) {
    const span = startChildSpan(traceContext);
    const channelConfig = buildChannelConfig(airlineCode, locale);

    logger.info("channel_config.generated", span, {
      input_summary: JSON.stringify({ airline_code: airlineCode, locale }),
      output_summary: channelConfig.channel_name
    });

    return channelConfig;
  }

  getCatalog(traceContext: TraceContext) {
    const span = startChildSpan(traceContext);
    const catalog = buildChannelCatalog();

    logger.info("channel_catalog.loaded", span, {
      output_summary: `${catalog.length} entries`,
      metadata: {
        game_ids: catalog.map((entry) => entry.game_id)
      }
    });

    return catalog;
  }

  bootstrapSession(
    traceContext: TraceContext,
    payload: unknown
  ): SessionBootstrapResponse {
    const span = startChildSpan(traceContext);
    const parsedPayload = this.parseBootstrapPayload(payload, span);
    const passengerId =
      parsedPayload.passenger_id ?? `guest-${traceContext.trace_id}`;
    const sessionId =
      parsedPayload.session_id ?? `sess-${traceContext.trace_id.slice(0, 8)}`;

    const session = buildGameLaunchContext({
      airlineCode: parsedPayload.airline_code,
      cabinClass: parsedPayload.cabin_class,
      locale: parsedPayload.locale,
      passengerId,
      sessionId,
      seatNumber: parsedPayload.seat_number
    });

    const response = sessionBootstrapResponseSchema.parse({
      trace_id: traceContext.trace_id,
      session,
      channel_config: this.getChannelConfig(
        span,
        parsedPayload.airline_code,
        parsedPayload.locale
      ),
      catalog: this.getCatalog(span)
    });

    logger.info("session.bootstrap.completed", span, {
      input_summary: JSON.stringify(parsedPayload),
      output_summary: JSON.stringify({
        session_id: response.session.sessionId,
        catalog_count: response.catalog.length
      })
    });

    return response;
  }

  private parseBootstrapPayload(
    payload: unknown,
    traceContext: TraceContext
  ): SessionBootstrapRequest {
    const parsed = sessionBootstrapRequestSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn("session.bootstrap.invalid_payload", traceContext, {
      input_summary: JSON.stringify(payload ?? {}),
      error_detail: parsed.error.message,
      status: "error"
    });

    throw new BadRequestException({
      message: "Invalid session bootstrap payload",
      issues: parsed.error.flatten()
    });
  }
}
