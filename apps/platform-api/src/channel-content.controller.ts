import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req
} from "@nestjs/common";
import { UseGuards } from "@nestjs/common";

import { AdminAuditService } from "./admin-audit.service";
import { AdminAuthGuard } from "./admin-auth.guard";
import { assertHasRole } from "./admin-auth.controller";
import type { TraceRequest } from "./http.types";
import { ChannelContentService } from "./channel-content.service";

@UseGuards(AdminAuthGuard)
@Controller("admin/channel")
export class ChannelContentController {
  constructor(
    @Inject(ChannelContentService)
    private readonly channelContentService: ChannelContentService,
    @Inject(AdminAuditService)
    private readonly adminAuditService: AdminAuditService
  ) {}

  @Get("content")
  getContent(
    @Req() req: TraceRequest,
    @Query("airline_code") airlineCode = "MU",
    @Query("locale") locale = "zh-CN"
  ) {
    assertHasRole(req, ["content_admin", "super_admin"]);
    return this.channelContentService.getChannelContent(
      req.trace_context!,
      airlineCode,
      locale
    );
  }

  @Put("content")
  async updateContent(@Req() req: TraceRequest, @Body() body: unknown) {
    assertHasRole(req, ["content_admin", "super_admin"]);
    const updated = await this.channelContentService.updateChannelContent(
      req.trace_context!,
      body
    );

    await this.adminAuditService.record(req.trace_context!, {
      action: "admin.channel.content_updated",
      actor: req.admin_context!.user,
      metadata: {
        airline_code: updated.channel_config.airline_code,
        locale: updated.channel_config.locale,
        published_count: updated.catalog.filter((entry) => entry.status === "published").length
      },
      summary: `Updated channel content for ${updated.channel_config.airline_code}/${updated.channel_config.locale}`,
      target_id: `${updated.channel_config.airline_code}:${updated.channel_config.locale}`,
      target_type: "channel_content"
    });

    return updated;
  }
}
