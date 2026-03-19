import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";

import { AdminAuditService } from "./admin-audit.service";
import { assertHasRole } from "./admin-auth.controller";
import { AdminAuthGuard } from "./admin-auth.guard";
import type { TraceRequest } from "./http.types";
import { PointsRulesService } from "./points-rules.service";

@UseGuards(AdminAuthGuard)
@Controller("admin/points-rules")
export class PointsRulesController {
  constructor(
    @Inject(PointsRulesService)
    private readonly pointsRulesService: PointsRulesService,
    @Inject(AdminAuditService)
    private readonly adminAuditService: AdminAuditService
  ) {}

  @Get("config")
  getConfig(
    @Req() req: TraceRequest,
    @Query("airline_code") airlineCode = "MU",
    @Query("game_id") gameId = "quiz-duel"
  ) {
    assertHasRole(req, ["ops_admin", "super_admin"]);
    return this.pointsRulesService.getRuleSet(
      req.trace_context!,
      airlineCode,
      gameId
    );
  }

  @Put("config")
  async updateConfig(@Req() req: TraceRequest, @Body() body: unknown) {
    assertHasRole(req, ["ops_admin", "super_admin"]);
    const updated = await this.pointsRulesService.upsertRuleSet(
      req.trace_context!,
      body
    );

    await this.adminAuditService.record(req.trace_context!, {
      action: "admin.points_rules.updated",
      actor: req.admin_context!.user,
      metadata: {
        airline_code: updated.airline_code,
        game_id: updated.game_id,
        rule_count: updated.rules.length
      },
      summary: `Updated points rules for ${updated.airline_code}/${updated.game_id}`,
      target_id: `${updated.airline_code}:${updated.game_id}`,
      target_type: "points_rule_set"
    });

    return updated;
  }

  @Get("audit")
  getAudit(
    @Req() req: TraceRequest,
    @Query("passenger_id") passengerId?: string,
    @Query("game_id") gameId?: string,
    @Query("limit") limit?: string
  ) {
    assertHasRole(req, ["ops_admin", "super_admin"]);
    return this.pointsRulesService.listAuditEntries(req.trace_context!, {
      game_id: gameId,
      limit,
      passenger_id: passengerId
    });
  }
}
