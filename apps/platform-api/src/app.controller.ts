import { Body, Controller, Get, Inject, Post, Query, Req } from "@nestjs/common";

import { AppService } from "./app.service";
import type { TraceRequest } from "./http.types";

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get("health")
  getHealth() {
    return this.appService.getHealth();
  }

  @Get("contracts/game-package")
  getGamePackageContract() {
    return this.appService.getGamePackageContract();
  }

  @Get("channel/config")
  getChannelConfig(
    @Req() req: TraceRequest,
    @Query("airline_code") airlineCode = "DEMO",
    @Query("locale") locale = "en-US"
  ) {
    return this.appService.getChannelConfig(req.trace_context!, airlineCode, locale);
  }

  @Get("channel/catalog")
  getCatalog(@Req() req: TraceRequest) {
    return this.appService.getCatalog(req.trace_context!);
  }

  @Post("session/bootstrap")
  bootstrapSession(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.appService.bootstrapSession(req.trace_context!, body);
  }
}
