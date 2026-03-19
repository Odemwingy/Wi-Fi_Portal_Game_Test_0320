import { z } from "zod";

export const adminRoleValues = [
  "content_admin",
  "ops_admin",
  "super_admin"
] as const;

export type AdminRole = (typeof adminRoleValues)[number];

export const adminUserSchema = z.object({
  display_name: z.string().min(1),
  roles: z.array(z.enum(adminRoleValues)).min(1),
  user_id: z.string().min(1),
  username: z.string().min(1)
});

export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminSessionSchema = z.object({
  expires_at: z.string().min(1),
  session_token: z.string().min(1),
  user: adminUserSchema
});

export type AdminSession = z.infer<typeof adminSessionSchema>;

export const adminLoginRequestSchema = z.object({
  password: z.string().min(1),
  username: z.string().min(1)
});

export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;

export const adminAuditEntrySchema = z.object({
  action: z.string().min(1),
  actor_user_id: z.string().min(1).nullable(),
  actor_username: z.string().min(1).nullable(),
  audit_id: z.string().min(1),
  created_at: z.string().min(1),
  metadata: z.record(z.unknown()),
  summary: z.string().min(1),
  target_id: z.string().min(1).nullable(),
  target_type: z.string().min(1)
});

export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;

export const adminAuditListResponseSchema = z.object({
  entries: z.array(adminAuditEntrySchema)
});

export type AdminAuditListResponse = z.infer<
  typeof adminAuditListResponseSchema
>;
