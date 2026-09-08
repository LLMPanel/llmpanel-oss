import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  ownerAc,
  memberAc,
} from "better-auth/plugins/organization/access";

/**
 * Workspace permission catalog. The org-management statements (organization,
 * member, invitation) come from better-auth; the rest are LLMPanel resources
 * enforced by the API's role guards.
 */
export const workspaceStatements = {
  ...defaultStatements,
  deployment: ["create", "update", "delete", "read"],
  provider: ["create", "update", "delete", "read"],
  apiKey: ["create", "delete", "read"],
  billing: ["read", "manage"],
} as const;

export const ac = createAccessControl(workspaceStatements);

/** Owner: everything — members, providers, billing, deleting the workspace. */
export const owner = ac.newRole({
  ...ownerAc.statements,
  deployment: ["create", "update", "delete", "read"],
  provider: ["create", "update", "delete", "read"],
  apiKey: ["create", "delete", "read"],
  billing: ["read", "manage"],
});

/** Member: day-to-day work — deployments, chat, API keys. No workspace admin. */
export const member = ac.newRole({
  ...memberAc.statements,
  deployment: ["create", "update", "delete", "read"],
  provider: ["read"],
  apiKey: ["create", "delete", "read"],
  billing: ["read"],
});

/** Viewer: read-only — dashboards, logs, usage. */
export const viewer = ac.newRole({
  deployment: ["read"],
  provider: ["read"],
  apiKey: ["read"],
  billing: ["read"],
});

export const workspaceRoles = { owner, member, viewer };

export type WorkspaceRole = keyof typeof workspaceRoles;

export const WORKSPACE_ROLE_VALUES = ["owner", "member", "viewer"] as const;
