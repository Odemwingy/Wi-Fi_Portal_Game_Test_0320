import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";

import { AdminAuditService } from "./admin-audit.service";
import { assertHasRole } from "./admin-auth.controller";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AirlinePointsService } from "./airline-points.service";
import type { TraceRequest } from "./http.types";

@UseGuards(AdminAuthGuard)
@Controller("admin/airline-points")
export class AirlinePointsController {
  constructor(
    @Inject(AirlinePointsService)
    private readonly airlinePointsService: AirlinePointsService,
    @Inject(AdminAuditService)
    private readonly adminAuditService: AdminAuditService
  ) {}

  @Get("config")
  getConfig(
    @Req() req: TraceRequest,
    @Query("airline_code") airlineCode = "MU"
  ) {
    assertHasRole(req, ["ops_admin", "super_admin"]);
    return this.airlinePointsService.getConfig(req.trace_context!, airlineCode);
  }

  @Put("config")
  async updateConfig(@Req() req: TraceRequest, @Body() body: unknown) {
    assertHasRole(req, ["ops_admin", "super_admin"]);
    const updated = await this.airlinePointsService.updateConfig(
      req.trace_context!,
      body
    );

    await this.adminAuditService.record(req.trace_context!, {
      action: "admin.airline_points.config_updated",
      actor: req.admin_context!.user,
      metadata: {
        airline_code: updated.airline_code,
        provider: updated.provider,
        sync_mode: updated.sync_mode
      },
      summary: `Updated airline points config for ${updated.airline_code}`,
      target_id: updated.airline_code,
      target_type: "airline_points_config"
    });

    return updated;
  }

  @Get("sync-records")
  listSyncRecords(
    @Req() req: TraceRequest,
    @Query("airline_code") airlineCode?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string
  ) {
    assertHasRole(req, ["ops_admin", "super_admin"]);
    return this.airlinePointsService.listSyncRecords(req.trace_context!, {
      airline_code: airlineCode,
      limit,
      status
    });
  }

  @Post("dispatch-pending")
  async dispatchPending(@Req() req: TraceRequest, @Body() body: unknown) {
    assertHasRole(req, ["ops_admin", "super_admin"]);
    const response = await this.airlinePointsService.dispatchPending(
      req.trace_context!,
      body
    );

    await this.adminAuditService.record(req.trace_context!, {
      action: "admin.airline_points.pending_dispatched",
      actor: req.admin_context!.user,
      metadata: {
        processed_count: response.processed_count
      },
      summary: `Dispatched ${response.processed_count} airline sync records`,
      target_type: "airline_points_sync_batch"
    });

    return response;
  }

  @Post("sync-records/:syncId/retry")
  async retrySync(@Req() req: TraceRequest, @Param("syncId") syncId: string) {
    assertHasRole(req, ["ops_admin", "super_admin"]);
    const record = await this.airlinePointsService.retrySync(
      req.trace_context!,
      syncId
    );

    await this.adminAuditService.record(req.trace_context!, {
      action: "admin.airline_points.sync_retried",
      actor: req.admin_context!.user,
      metadata: {
        airline_code: record.airline_code,
        status: record.status
      },
      summary: `Retried airline sync ${record.sync_id}`,
      target_id: record.sync_id,
      target_type: "airline_points_sync_record"
    });

    return record;
  }
}
