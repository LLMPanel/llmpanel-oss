// apps/api/src/services/audit-log.service.ts
import { db } from "@llmpanel/db"
import { auditLogs } from "@llmpanel/db/schema"
import { randomUUID } from "crypto"

export type AuditAction =
  | "user.signed_in"
  | "user.created"
  | "user.updated"
  | "user.role_changed"
  | "user.suspended"
  | "user.reactivated"
  | "user.password_reset"
  | "user.session_revoked"
  | "user.sessions_revoked"

export interface AuditEntry {
  /** The user the action was performed ON (shown in their activity feed). */
  userId: string
  action: AuditAction
  resourceType?: string
  resourceId?: string
  /** Extra context, e.g. { by: adminUserId, from: "user", to: "admin" } */
  metadata?: Record<string, unknown>
}

/**
 * Best-effort audit write — user-facing requests must never fail because
 * the audit insert did.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: randomUUID(),
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType ?? "user",
      resourceId: entry.resourceId ?? entry.userId,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      createdAt: new Date(),
    })
  } catch (err) {
    console.error("[audit] failed to write audit log:", err)
  }
}
