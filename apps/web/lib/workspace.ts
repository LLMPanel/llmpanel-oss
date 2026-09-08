import type { WorkspaceRole } from "@llmpanel/shared"
import { WORKSPACE_ROLE_VALUES } from "@llmpanel/shared"

export type { WorkspaceRole }

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = WORKSPACE_ROLE_VALUES

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

/** Collision-resistant tail for generated slugs — slugs are globally unique. */
export function randomSuffix(length = 6): string {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < length; i += 1) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length]
  }
  return out
}

/**
 * Turns a workspace name into a URL-safe slug. Two people can both name their
 * workspace "Acme", so a random suffix keeps `organization.create` from
 * failing on a slug collision.
 */
export function workspaceSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "")
  return `${base || "workspace"}-${randomSuffix()}`
}

/** The link handed to an invitee — resolved by app/invite/[id]/page.tsx. */
export function inviteLinkFor(origin: string, invitationId: string): string {
  return `${origin}/invite/${invitationId}`
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLE_VALUES as readonly string[]).includes(value)
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  member: "Member",
  viewer: "Viewer",
}

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: "Full access, including members and billing",
  member: "Create and manage deployments",
  viewer: "Read-only access",
}

export function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  // `default` is the primary-tinted chip — the same treatment as the "Default"
  // provider tag and the "Recommended" quantization tag. Deliberately not one
  // hue per role: `purple` already means RunPod on the providers page.
  if (role === "owner") return "default"
  if (role === "viewer") return "outline"
  return "secondary"
}

export function formatWorkspaceDate(value: Date | string | null | undefined): string {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
