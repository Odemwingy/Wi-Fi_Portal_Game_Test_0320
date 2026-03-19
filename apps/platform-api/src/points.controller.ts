import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req
} from "@nestjs/common";

import type { TraceRequest } from "./http.types";
import { PointsService } from "./points.service";

@Controller("points")
export class PointsController {
  constructor(
    @Inject(PointsService) private readonly pointsService: PointsService
  ) {}

  @Get("leaderboard")
  getLeaderboard(@Req() req: TraceRequest, @Query("limit") limit?: string) {
    return this.pointsService.getLeaderboard(req.trace_context!, limit);
  }

  @Get("passengers/:passengerId")
  getPassengerSummary(
    @Req() req: TraceRequest,
    @Param("passengerId") passengerId: string
  ) {
    return this.pointsService.getPassengerSummary(req.trace_context!, passengerId);
  }

  @Post("report")
  reportPoints(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.pointsService.reportPoints(req.trace_context!, body);
  }
}
