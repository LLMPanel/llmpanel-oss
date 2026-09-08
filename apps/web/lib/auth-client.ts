import { createAuthClient } from "better-auth/react"
import {
  twoFactorClient,
  organizationClient,
  emailOTPClient,
} from "better-auth/client/plugins"
import { ac, workspaceRoles } from "@llmpanel/shared"

// No `baseURL` on purpose: defaulting to window.location.origin sends auth calls
// to /api/auth/* on the web app itself, which next.config.ts rewrites to the Hono
// API. The session cookie therefore comes back first-party, so middleware.ts can
// read it even when the API lives on a different domain in production.
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient(),
    emailOTPClient(),
    organizationClient({
      ac,
      roles: workspaceRoles,
    }),
  ],
})

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  twoFactor,
  emailOtp,
  organization,
  useActiveOrganization,
  useListOrganizations,
} = authClient