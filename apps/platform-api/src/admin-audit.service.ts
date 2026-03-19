import { Inject, Injectable } from "@nestjs/common";

import {
  adminAuditListResponseSchema,
  type AdminAuditEntry,
  type AdminUser
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import { AdminAuditRepository } from "./repositories/admin-audit.repository";

const logger = createStructuredLogger("platform-api.admin-audit");

@Injectable()
export class AdminAuditService {
  constructor(
    @Inject(AdminAuditRepository)
    private readonly repository: AdminAuditRepository
  ) {}

  async list(traceContext: TraceContext, limit = 20) {
    const span = startChildSpan(traceContext);
    const entries = await this.repository.list(limit);

    logger.info("admin.audit.loaded", span, {
      input_summary: JSON.stringify({ limit }),
      output_summary: `${entries.length} entries`
    });

    return adminAuditListResponseSchema.parse({ entries });
  }

  async record(
    traceContext: TraceContext,
    payload: {
      action: string;
      actor?: AdminUser | null;
      metadata?: Record<string, unknown>;
      summary: string;
      target_id?: string | null;
      target_type: string;
    }
  ) {
    const span = startChildSpan(traceContext);
    const entry: AdminAuditEntry = {
      action: payload.action,
      actor_user_id: payload.actor?.user_id ?? null,
      actor_username: payload.actor?.username ?? null,
      audit_id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      created_at: new Date().toISOString(),
      metadata: payload.metadata ?? {},
      summary: payload.summary,
      target_id: payload.target_id ?? null,
      target_type: payload.target_type
    };

    const saved = await this.repository.append(entry);

    logger.info("admin.audit.recorded", span, {
      input_summary: payload.action,
      output_summary: payload.summary,
      metadata: {
        actor_user_id: saved.actor_user_id,
        target_type: saved.target_type
      }
    });

    return saved;
  }
}
