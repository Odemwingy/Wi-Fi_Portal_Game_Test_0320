import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { randomBytes } from "node:crypto";

import {
  adminLoginRequestSchema,
  type AdminLoginRequest,
  type AdminSession,
  type AdminUser
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import { AdminAuditService } from "./admin-audit.service";
import { AdminSessionRepository } from "./repositories/admin-session.repository";

const logger = createStructuredLogger("platform-api.admin-auth");
const SESSION_TTL_MS = 60 * 60 * 8 * 1000;

type SeededAdminUser = AdminUser & {
  password: string;
};

const seededAdminUsers: SeededAdminUser[] = [
  {
    display_name: "Content Admin",
    password: "portal-content-123",
    roles: ["content_admin"],
    user_id: "admin-content",
    username: "content-admin"
  },
  {
    display_name: "Ops Admin",
    password: "portal-ops-123",
    roles: ["content_admin", "ops_admin"],
    user_id: "admin-ops",
    username: "ops-admin"
  },
  {
    display_name: "Super Admin",
    password: "portal-super-123",
    roles: ["content_admin", "ops_admin", "super_admin"],
    user_id: "admin-super",
    username: "super-admin"
  }
];

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(AdminSessionRepository)
    private readonly sessionRepository: AdminSessionRepository,
    @Inject(AdminAuditService)
    private readonly adminAuditService: AdminAuditService
  ) {}

  async getSession(traceContext: TraceContext, sessionToken: string) {
    const span = startChildSpan(traceContext);
    const session = await this.sessionRepository.get(sessionToken);

    if (!session) {
      throw new UnauthorizedException("Admin session is missing or expired");
    }

    logger.info("admin.auth.session_loaded", span, {
      input_summary: session.user.username,
      output_summary: session.expires_at
    });

    return session;
  }

  async login(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const parsedPayload = this.parseLoginPayload(payload, span);
    const matchedUser = seededAdminUsers.find(
      (candidate) => candidate.username === parsedPayload.username
    );

    if (!matchedUser || matchedUser.password !== parsedPayload.password) {
      logger.warn("admin.auth.login_failed", span, {
        input_summary: parsedPayload.username,
        status: "error"
      });
      await this.adminAuditService.record(span, {
        action: "admin.auth.login_failed",
        actor: null,
        metadata: {
          attempted_username: parsedPayload.username
        },
        summary: `Failed login for ${parsedPayload.username}`,
        target_id: parsedPayload.username,
        target_type: "admin_user"
      });
      throw new UnauthorizedException("Invalid admin username or password");
    }

    const session: AdminSession = {
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      session_token: randomBytes(24).toString("hex"),
      user: {
        display_name: matchedUser.display_name,
        roles: matchedUser.roles,
        user_id: matchedUser.user_id,
        username: matchedUser.username
      }
    };

    const saved = await this.sessionRepository.set(session);
    await this.adminAuditService.record(span, {
      action: "admin.auth.login_succeeded",
      actor: saved.user,
      summary: `${saved.user.username} signed in`,
      target_id: saved.user.user_id,
      target_type: "admin_session"
    });

    logger.info("admin.auth.login_succeeded", span, {
      input_summary: saved.user.username,
      output_summary: saved.expires_at
    });

    return saved;
  }

  async logout(traceContext: TraceContext, session: AdminSession) {
    const span = startChildSpan(traceContext);
    await this.sessionRepository.delete(session.session_token);
    await this.adminAuditService.record(span, {
      action: "admin.auth.logout",
      actor: session.user,
      summary: `${session.user.username} signed out`,
      target_id: session.user.user_id,
      target_type: "admin_session"
    });

    logger.info("admin.auth.logout", span, {
      input_summary: session.user.username,
      output_summary: "session revoked"
    });

    return {
      ok: true as const
    };
  }

  private parseLoginPayload(
    payload: unknown,
    traceContext: TraceContext
  ): AdminLoginRequest {
    const parsed = adminLoginRequestSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn("admin.auth.invalid_login_payload", traceContext, {
      error_detail: parsed.error.message,
      input_summary: JSON.stringify(payload ?? {}),
      status: "error"
    });

    throw new BadRequestException({
      issues: parsed.error.flatten(),
      message: "Invalid admin login payload"
    });
  }
}
