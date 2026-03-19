import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { AdminAuditService } from "./admin-audit.service";
import { AdminAuthService } from "./admin-auth.service";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import {
  AdminAuditRepository,
  StateStoreAdminAuditRepository
} from "./repositories/admin-audit.repository";
import {
  AdminSessionRepository,
  StateStoreAdminSessionRepository
} from "./repositories/admin-session.repository";

describe("AdminAuthService", () => {
  it("issues sessions for valid demo credentials and persists audit entries", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const sessionRepository: AdminSessionRepository =
      new StateStoreAdminSessionRepository(stateStore);
    const auditRepository: AdminAuditRepository =
      new StateStoreAdminAuditRepository(stateStore);
    const auditService = new AdminAuditService(auditRepository);
    const service = new AdminAuthService(sessionRepository, auditService);
    const trace = startTrace();

    const session = await service.login(trace, {
      password: "portal-super-123",
      username: "super-admin"
    });
    const loaded = await service.getSession(trace, session.session_token);
    const audit = await auditService.list(trace);

    expect(loaded.user.username).toBe("super-admin");
    expect(loaded.user.roles).toContain("super_admin");
    expect(audit.entries[0]).toMatchObject({
      action: "admin.auth.login_succeeded",
      actor_username: "super-admin"
    });
  });

  it("revokes sessions on logout", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const sessionRepository: AdminSessionRepository =
      new StateStoreAdminSessionRepository(stateStore);
    const auditRepository: AdminAuditRepository =
      new StateStoreAdminAuditRepository(stateStore);
    const auditService = new AdminAuditService(auditRepository);
    const service = new AdminAuthService(sessionRepository, auditService);
    const trace = startTrace();

    const session = await service.login(trace, {
      password: "portal-content-123",
      username: "content-admin"
    });

    await service.logout(trace, session);

    await expect(
      service.getSession(trace, session.session_token)
    ).rejects.toThrowError(/missing or expired/i);
  });
});
