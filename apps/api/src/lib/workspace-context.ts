import type { Context } from "hono"
import type { WorkspaceRole } from "@llmpanel/shared"
import { WORKSPACE_ROLE_VALUES } from "@llmpanel/shared"

/**
 * Every session-authenticated request carries the workspace it acts in. The
 * augmentation makes `c.get("workspaceId")` / `c.get("workspaceRole")` typed on
 * routers that declare their own `Variables` (e.g. admin.route, gateway.route)
 * as well as on plain `new Hono()` routers.
 */
declare module "hono" {
  interface ContextVariableMap {
    workspaceId: string
    workspaceRole: WorkspaceRole
  }
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" &&
    (WORKSPACE_ROLE_VALUES as readonly string[]).includes(value)
  )
}

/**
 * Better Auth stores `member.role` as free text and supports comma-separated
 * multi-roles. Resolve it to the single most-privileged known role; anything
 * unrecognised falls back to the least-privileged one (read-only).
 */
export function normalizeWorkspaceRole(raw: string | null | undefined): WorkspaceRole {
  const parts = (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(isWorkspaceRole)

  if (parts.includes("owner")) return "owner"
  if (parts.includes("member")) return "member"
  return "viewer"
}

/** Rank used by the role guards — higher wins. */
export const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  owner: 2,
}

/**
 * Typed accessors. Controllers take a bare `Context`, whose variables are
 * loosely typed, so read through these to keep a real `string` / role type
 * without casts. They throw only if a route forgot `sessionAuth`.
 */
export function getWorkspaceId(c: Context): string {
  const value: unknown = c.get("workspaceId")
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("No active workspace on request — sessionAuth must run first")
  }
  return value
}

export function getWorkspaceRole(c: Context): WorkspaceRole {
  const value: unknown = c.get("workspaceRole")
  return isWorkspaceRole(value) ? value : "viewer"
}
