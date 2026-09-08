import { createMiddleware } from "hono/factory"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@llmpanel/db"
import { member } from "@llmpanel/db/schema"
import type { WorkspaceRole } from "@llmpanel/shared"
import { auth } from "../lib/auth"
import { normalizeWorkspaceRole } from "../lib/workspace-context"

interface ActiveWorkspace {
  workspaceId: string
  role: WorkspaceRole
}

/**
 * Resolves the workspace a request acts in.
 *
 * The session's `activeOrganizationId` is a hint, never proof: a user removed
 * from a workspace keeps the stale id in their session until it expires, so the
 * membership is always re-read from the DB. Reading the role here (rather than
 * from the cookie-cached session) is what makes role changes take effect on the
 * very next request instead of after the 5-minute session cache window.
 */
export async function resolveActiveWorkspace(
  userId: string,
  activeOrganizationId: string | null | undefined
): Promise<ActiveWorkspace | null> {
  if (activeOrganizationId) {
    const active = await db.query.member.findFirst({
      where: and(
        eq(member.userId, userId),
        eq(member.organizationId, activeOrganizationId)
      ),
      columns: { organizationId: true, role: true },
    })
    if (active) {
      return {
        workspaceId: active.organizationId,
        role: normalizeWorkspaceRole(active.role),
      }
    }
  }

  // Legacy sessions (created before workspaces existed) and stale active ids
  // fall back to the user's oldest membership — their personal workspace.
  const oldest = await db.query.member.findFirst({
    where: eq(member.userId, userId),
    orderBy: asc(member.createdAt),
    columns: { organizationId: true, role: true },
  })
  if (!oldest) return null

  return {
    workspaceId: oldest.organizationId,
    role: normalizeWorkspaceRole(oldest.role),
  }
}

export const sessionAuth = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  const workspace = await resolveActiveWorkspace(
    session.user.id,
    session.session.activeOrganizationId
  )

  if (!workspace) {
    return c.json(
      { error: "No workspace found for this account. Ask an administrator for access." },
      403
    )
  }

  c.set("user", session.user)
  c.set("session", session.session)
  c.set("workspaceId", workspace.workspaceId)
  c.set("workspaceRole", workspace.role)
  await next()
})

export const adminAuth = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session || session.user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403)
  }

  c.set("user", session.user)
  await next()
})
