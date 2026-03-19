import { Inject, Injectable } from "@nestjs/common";

import {
  adminAuditEntrySchema,
  type AdminAuditEntry
} from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

const ADMIN_AUDIT_KEY_PREFIX = "wifi-portal:admin-audit:";
const ADMIN_AUDIT_TTL_SECONDS = 60 * 60 * 24 * 30;

export abstract class AdminAuditRepository {
  abstract append(entry: AdminAuditEntry): Promise<AdminAuditEntry>;
  abstract list(limit: number): Promise<AdminAuditEntry[]>;
}

@Injectable()
export class StateStoreAdminAuditRepository extends AdminAuditRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async append(entry: AdminAuditEntry) {
    const validated = adminAuditEntrySchema.parse(entry);
    await this.stateStore.set(this.toStorageKey(validated), validated, {
      ttl_seconds: ADMIN_AUDIT_TTL_SECONDS
    });
    return validated;
  }

  async list(limit: number) {
    const keys = (await this.stateStore.list(ADMIN_AUDIT_KEY_PREFIX))
      .sort()
      .reverse()
      .slice(0, limit);

    const entries = await Promise.all(
      keys.map(async (key) => this.stateStore.get<AdminAuditEntry>(key))
    );

    return entries
      .filter((entry): entry is AdminAuditEntry => !!entry)
      .map((entry) => adminAuditEntrySchema.parse(entry));
  }

  private toStorageKey(entry: AdminAuditEntry) {
    return `${ADMIN_AUDIT_KEY_PREFIX}${entry.created_at}:${entry.audit_id}`;
  }
}
