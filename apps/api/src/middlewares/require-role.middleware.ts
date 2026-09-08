import { createMiddleware } from "hono/factory"
import type { WorkspaceRole } from "@llmpanel/shared"
import { WORKSPACE_ROLE_RANK, getWorkspaceRole } from "../lib/workspace-context"

/**
 * Workspace role guard. Must run after `sessionAuth`, which resolves the
 * caller's role fresh from the member table on every request.
 *
 *   requireRole("member") → member + owner   (blocks read-only viewers)
 *   requireRole("owner")  → owner only       (providers, billing, destructive ops)
 */
export function requireRole(minimum: WorkspaceRole) {
  return createMiddleware(async (c, next) => {
    const role = getWorkspaceRole(c)

    if (WORKSPACE_ROLE_RANK[role] < WORKSPACE_ROLE_RANK[minimum]) {
      return c.json(
        {
          error:
            minimum === "owner"
              ? "Forbidden — workspace owner access required"
              : "Forbidden — your workspace role is read-only",
          requiredRole: minimum,
          role,
        },
        403
      )
    }

    await next()
  })
}
