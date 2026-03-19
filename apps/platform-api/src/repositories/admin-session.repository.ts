import { Inject, Injectable } from "@nestjs/common";

import {
  adminSessionSchema,
  type AdminSession
} from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

const ADMIN_SESSION_KEY_PREFIX = "wifi-portal:admin-session:";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

export abstract class AdminSessionRepository {
  abstract delete(sessionToken: string): Promise<void>;
  abstract get(sessionToken: string): Promise<AdminSession | undefined>;
  abstract set(session: AdminSession): Promise<AdminSession>;
}

@Injectable()
export class StateStoreAdminSessionRepository extends AdminSessionRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(sessionToken: string) {
    await this.stateStore.delete(this.toStorageKey(sessionToken));
  }

  async get(sessionToken: string) {
    const session = await this.stateStore.get<AdminSession>(
      this.toStorageKey(sessionToken)
    );

    return session ? adminSessionSchema.parse(session) : undefined;
  }

  async set(session: AdminSession) {
    const validated = adminSessionSchema.parse(session);

    return this.stateStore.set(this.toStorageKey(validated.session_token), validated, {
      ttl_seconds: ADMIN_SESSION_TTL_SECONDS
    });
  }

  private toStorageKey(sessionToken: string) {
    return `${ADMIN_SESSION_KEY_PREFIX}${sessionToken}`;
  }
}
