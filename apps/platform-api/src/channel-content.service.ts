import {
  BadRequestException,
  Inject,
  Injectable
} from "@nestjs/common";

import {
  channelContentStateSchema,
  channelContentUpdateRequestSchema,
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import {
  buildChannelCatalog,
  buildDefaultChannelContent,
  buildPublicChannelConfig,
  listDefaultCatalogGameIds,
  mergeManagedCatalogEntry
} from "./catalog.data";
import { ChannelContentRepository } from "./repositories/channel-content.repository";

const logger = createStructuredLogger("platform-api.channel-content");

@Injectable()
export class ChannelContentService {
  constructor(
    @Inject(ChannelContentRepository)
    private readonly repository: ChannelContentRepository
  ) {}

  async getChannelContent(
    traceContext: TraceContext,
    airlineCode: string,
    locale: string
  ) {
    const span = startChildSpan(traceContext);
    const content = await this.loadOrSeedChannelContent(airlineCode, locale);

    logger.info("channel_content.loaded", span, {
      input_summary: JSON.stringify({
        airline_code: airlineCode,
        locale
      }),
      output_summary: `${content.catalog.length} managed entries`
    });

    return content;
  }

  async getPublicCatalog(
    traceContext: TraceContext,
    airlineCode: string,
    locale: string
  ) {
    const content = await this.getChannelContent(traceContext, airlineCode, locale);
    return buildChannelCatalog(content);
  }

  async getPublicChannelConfig(
    traceContext: TraceContext,
    airlineCode: string,
    locale: string
  ) {
    const content = await this.getChannelContent(traceContext, airlineCode, locale);
    return buildPublicChannelConfig(content);
  }

  async updateChannelContent(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const parsedPayload = this.parseUpdatePayload(payload, span);
    const airlineCode = parsedPayload.channel_config.airline_code;
    const locale = parsedPayload.channel_config.locale;
    const defaultContent = buildDefaultChannelContent(airlineCode, locale);
    const baseEntries = new Map(
      defaultContent.catalog.map((entry) => [entry.game_id, entry])
    );

    this.ensureCatalogCoverage(parsedPayload.catalog);

    const nextState = channelContentStateSchema.parse({
      catalog: parsedPayload.catalog.map((entry) => {
        const baseEntry = baseEntries.get(entry.game_id);
        if (!baseEntry) {
          throw new BadRequestException(`Unknown game_id ${entry.game_id}`);
        }

        return mergeManagedCatalogEntry(baseEntry, entry);
      }),
      channel_config: parsedPayload.channel_config,
      updated_at: new Date().toISOString()
    });

    await this.repository.set(airlineCode, locale, nextState);

    logger.info("channel_content.updated", span, {
      input_summary: JSON.stringify({
        airline_code: airlineCode,
        locale
      }),
      output_summary: `${nextState.catalog.filter((entry) => entry.status === "published").length} published entries`
    });

    return nextState;
  }

  private ensureCatalogCoverage(
    catalog: Array<{
      game_id: string;
    }>
  ) {
    const expectedGameIds = listDefaultCatalogGameIds().slice().sort();
    const receivedGameIds = [...new Set(catalog.map((entry) => entry.game_id))]
      .slice()
      .sort();

    if (
      expectedGameIds.length !== receivedGameIds.length ||
      expectedGameIds.some((gameId, index) => gameId !== receivedGameIds[index])
    ) {
      throw new BadRequestException({
        expected_game_ids: expectedGameIds,
        message: "Channel content update must include exactly one entry per known game",
        received_game_ids: receivedGameIds
      });
    }
  }

  private async loadOrSeedChannelContent(airlineCode: string, locale: string) {
    const existing = await this.repository.get(airlineCode, locale);
    if (existing) {
      return existing;
    }

    const seeded = buildDefaultChannelContent(airlineCode, locale);
    await this.repository.set(airlineCode, locale, seeded);
    return seeded;
  }

  private parseUpdatePayload(
    payload: unknown,
    traceContext: TraceContext
  ) {
    const parsed = channelContentUpdateRequestSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn("channel_content.invalid_payload", traceContext, {
      error_detail: parsed.error.message,
      input_summary: JSON.stringify(payload ?? {}),
      status: "error"
    });

    throw new BadRequestException({
      issues: parsed.error.flatten(),
      message: "Invalid channel content update payload"
    });
  }
}
