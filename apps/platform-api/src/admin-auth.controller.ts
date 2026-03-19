import {
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";

import { AdminAuditService } from "./admin-audit.service";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AdminAuthService } from "./admin-auth.service";
import type { TraceRequest } from "./http.types";

@Controller("admin")
export class AdminAuthController {
  constructor(
    @Inject(AdminAuthService)
    private readonly adminAuthService: AdminAuthService,
    @Inject(AdminAuditService)
    private readonly adminAuditService: AdminAuditService
  ) {}

  @Post("auth/login")
  login(@Req() req: TraceRequest) {
    return this.adminAuthService.login(req.trace_context!, req.body);
  }

  @UseGuards(AdminAuthGuard)
  @Get("auth/me")
  getMe(@Req() req: TraceRequest) {
    return req.admin_context!.session;
  }

  @UseGuards(AdminAuthGuard)
  @Post("auth/logout")
  logout(@Req() req: TraceRequest) {
    return this.adminAuthService.logout(
      req.trace_context!,
      req.admin_context!.session
    );
  }

  @UseGuards(AdminAuthGuard)
  @Get("audit/logs")
  getAuditLogs(@Req() req: TraceRequest) {
    assertHasRole(req, ["ops_admin", "super_admin"]);
    return this.adminAuditService.list(req.trace_context!);
  }
}

export function assertHasRole(
  request: TraceRequest,
  requiredRoles: Array<"content_admin" | "ops_admin" | "super_admin">
) {
  const adminContext = request.admin_context;
  if (!adminContext) {
    throw new UnauthorizedException("Admin session is required");
  }

  if (adminContext.user.roles.some((role) => requiredRoles.includes(role))) {
    return;
  }

  throw new UnauthorizedException(
    `Admin role ${requiredRoles.join(" or ")} is required`
  );
}
