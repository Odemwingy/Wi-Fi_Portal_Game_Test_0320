import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";

import { AdminAuthService } from "./admin-auth.service";
import type { TraceRequest } from "./http.types";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(AdminAuthService)
    private readonly adminAuthService: AdminAuthService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<TraceRequest>();
    const authorization = request.headers.authorization;
    const sessionToken = extractBearerToken(authorization);

    if (!sessionToken) {
      throw new UnauthorizedException("Missing admin bearer token");
    }

    const session = await this.adminAuthService.getSession(
      request.trace_context!,
      sessionToken
    );

    request.admin_context = {
      session,
      user: session.user
    };

    return true;
  }
}

function extractBearerToken(authorization: string | string[] | undefined) {
  if (typeof authorization !== "string") {
    return null;
  }

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}
