import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req
} from "@nestjs/common";

import type { TraceRequest } from "./http.types";
import { ChannelContentService } from "./channel-content.service";

@Controller("admin/channel")
export class ChannelContentController {
  constructor(
    @Inject(ChannelContentService)
    private readonly channelContentService: ChannelContentService
  ) {}

  @Get("content")
  getContent(
    @Req() req: TraceRequest,
    @Query("airline_code") airlineCode = "MU",
    @Query("locale") locale = "zh-CN"
  ) {
    return this.channelContentService.getChannelContent(
      req.trace_context!,
      airlineCode,
      locale
    );
  }

  @Put("content")
  updateContent(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.channelContentService.updateChannelContent(
      req.trace_context!,
      body
    );
  }
}
