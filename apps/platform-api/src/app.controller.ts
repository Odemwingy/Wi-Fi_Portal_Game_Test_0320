import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  ServiceUnavailableException
} from "@nestjs/common";

import { AppService } from "./app.service";
import type { TraceRequest } from "./http.types";
import { PlatformDiagnosticsService } from "./platform-diagnostics.service";

@Controller()
export class AppController {
  constructor(
    @Inject(AppService) private readonly appService: AppService,
    @Inject(PlatformDiagnosticsService)
    private readonly platformDiagnosticsService: PlatformDiagnosticsService
  ) {}

  @Get("health")
  getHealth() {
    return this.platformDiagnosticsService.getLiveness();
  }

  @Get("health/ready")
  async getReadiness() {
    const readiness = await this.platformDiagnosticsService.getReadiness();
    if (readiness.status !== "ready") {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }

  @Get("metrics")
  getMetrics() {
    return this.platformDiagnosticsService.getMetrics();
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
  getCatalog(
    @Req() req: TraceRequest,
    @Query("airline_code") airlineCode = "MU",
    @Query("locale") locale = "zh-CN"
  ) {
    return this.appService.getCatalog(req.trace_context!, airlineCode, locale);
  }

  @Post("session/bootstrap")
  bootstrapSession(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.appService.bootstrapSession(req.trace_context!, body);
  }
}
