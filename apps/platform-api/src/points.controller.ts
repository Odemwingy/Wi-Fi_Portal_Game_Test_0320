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
import { PointsRulesService } from "./points-rules.service";

@Controller("points")
export class PointsController {
  constructor(
    @Inject(PointsService) private readonly pointsService: PointsService,
    @Inject(PointsRulesService)
    private readonly pointsRulesService: PointsRulesService
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

  @Get("audit")
  getAudit(
    @Req() req: TraceRequest,
    @Query("passenger_id") passengerId?: string,
    @Query("game_id") gameId?: string,
    @Query("limit") limit?: string
  ) {
    return this.pointsRulesService.listAuditEntries(req.trace_context!, {
      game_id: gameId,
      limit,
      passenger_id: passengerId
    });
  }
}
