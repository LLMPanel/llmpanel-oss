import { betterAuth } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { twoFactor, organization, emailOTP } from "better-auth/plugins"
import { ac, workspaceRoles } from "@llmpanel/shared"
import { db } from "@llmpanel/db"
import * as schema from "@llmpanel/db/schema"
import { providerConnections } from "@llmpanel/db/schema"
import { and, eq, asc } from "drizzle-orm"
import { randomUUID } from "crypto"
import { env } from "../env"
import { logAudit } from "../services/audit-log.service"
import { assertSeatAvailable, billingPlugins } from "../services/billing.service"
import {
  isEmailConfigured,
  sendOTPEmail,
  sendSignupOTPEmail,
  sendPasswordResetOTPEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
} from "../services/email.service"
import {
  EmailPolicyError,
  USERNAME_EMAIL_DOMAIN,
  assertEmailAllowed,
  assertNotAliasOfExistingAccount,
  isUsernameOnlyEmail,
} from "../services/email-policy.service"

const hasGoogleAuth = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
const hasGithubAuth = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)

// Email ownership is proven with a one-time code before a new account can sign
// in. Only enforced when a code can actually reach the user: a configured
// provider, or the dev console (email.service prints it there). A fresh
// self-hosted install with no provider must never lock everyone out.
const emailVerificationEnabled = isEmailConfigured() || env.NODE_ENV === "development"

const SIGNUP_OTP_TTL_SECONDS = 10 * 60

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "workspace"

// Every account gets a personal workspace at signup so single-user installs
// never have to think about workspaces — their resources simply live in it.
// Idempotent: skips users that already belong to one (e.g. invited users).
export async function createPersonalWorkspace(user: {
  id: string
  name: string
  email: string
}): Promise<void> {
  const existing = await db.query.member.findFirst({
    where: eq(schema.member.userId, user.id),
    columns: { id: true },
  })
  if (existing) return

  const base = slugify(user.name || user.email.split("@")[0]!)
  const now = new Date()
  const organizationId = randomUUID()

  await db.insert(schema.organization).values({
    id: organizationId,
    name: user.name ? `${user.name}'s Workspace` : "Personal Workspace",
    slug: `${base}-${randomUUID().slice(0, 8)}`,
    createdAt: now,
  })
  await db.insert(schema.member).values({
    id: randomUUID(),
    organizationId,
    userId: user.id,
    role: "owner",
    createdAt: now,
  })
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),

    baseURL: env.BETTER_AUTH_BASE_URL ?? "http://localhost:8000",

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: emailVerificationEnabled,
    // Whoever reset the password proved they own the mailbox; anyone still
    // signed in elsewhere (possibly the reason for the reset) is logged out.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url)
    },
  },

  // No `sendVerificationEmail` here on purpose: the emailOTP plugin below
  // supplies it (overrideDefaultEmailVerification), turning the link email
  // into a 6-digit code. Options set here take precedence over the plugin's,
  // so defining one would silently bring the link flow back.
  emailVerification: {
    sendOnSignUp: emailVerificationEnabled,
    autoSignInAfterVerification: true,
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return

      const email = typeof ctx.body?.email === "string" ? ctx.body.email : ""

      // `<username>@users.local` is reserved for admin-created accounts, which
      // arrive through auth.api.signUpEmail() with no HTTP request attached.
      // Anyone on the public form claiming that domain would get a login that
      // bypasses every email gate — refuse it.
      if (ctx.request && isUsernameOnlyEmail(email)) {
        throw new APIError("BAD_REQUEST", {
          message: `Email addresses on ${USERNAME_EMAIL_DOMAIN} are reserved.`,
        })
      }
    }),
  },

  socialProviders: {
    ...(hasGoogleAuth
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {}),
    ...(hasGithubAuth
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID!,
            clientSecret: env.GITHUB_CLIENT_SECRET!,
          },
        }
      : {}),
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: SIGNUP_OTP_TTL_SECONDS,
      allowedAttempts: 5,
      // The code in the database is a hash; only the email carries the digits.
      storeOTP: "hashed",
      // Sign-up verification uses a code instead of the default link email.
      overrideDefaultEmailVerification: true,
      // Codes are for proving ownership of an address that already has an
      // account — never a passwordless way to create one.
      disableSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        // Admin-created username accounts have a synthetic address that no
        // mail server will accept; they are marked verified by the admin route.
        if (isUsernameOnlyEmail(email)) return

        switch (type) {
          case "email-verification":
            // Sign-up has already created the account by the time this runs.
            // A provider hiccup must not fail the request and strand a user
            // who then cannot re-register: log it, and let them hit "Resend".
            try {
              await sendSignupOTPEmail(email, otp)
            } catch (err) {
              console.error(`[auth] could not send sign-up code to ${email}:`, err)
            }
            return
          case "forget-password":
            // Without a provider (and outside dev, where the code is printed
            // to the console) the code could never arrive. Say so rather
            // than leaking a raw transport error or, worse, "code sent".
            if (!isEmailConfigured() && env.NODE_ENV !== "development") {
              throw new APIError("SERVICE_UNAVAILABLE", {
                message:
                  "Password reset by email is not set up on this server. Ask an administrator to reset your password.",
              })
            }
            await sendPasswordResetOTPEmail(email, otp)
            return
          case "sign-in":
            await sendOTPEmail(email, otp)
            return
        }
      },
    }),
    twoFactor({
      issuer: "LLMPanel",
      // Email OTP is only offered when it can actually be delivered: Resend in
      // production, console logging in dev. Without either, omitting otpOptions
      // disables the OTP endpoints entirely and 2FA is TOTP-only — the typical
      // self-hosted setup.
      ...(isEmailConfigured() || env.NODE_ENV === "development"
        ? {
            otpOptions: {
              async sendOTP({ user, otp }: { user: { email: string }; otp: string }) {
                await sendOTPEmail(user.email, otp)
              },
            },
          }
        : {}),
    }),
    organization({
      ac,
      roles: workspaceRoles,
      creatorRole: "owner",
      /**
       * Seat enforcement. No-op on self-hosted, where seats are unlimited.
       *
       * Guarded at three points rather than one, because they are genuinely
       * different doors into the same room:
       *  - inviting, so a single-seat workspace cannot promise seats it lacks;
       *  - accepting, so an invitation sent while on Team cannot be redeemed
       *    after a downgrade to Solo;
       *  - adding directly, which bypasses invitations entirely.
       *
       * Only additions are blocked. A workspace that downgrades keeps the
       * people it already has — ejecting colleagues because a card changed
       * would be a far worse failure than carrying an over-quota workspace.
       */
      organizationHooks: {
        beforeCreateInvitation: async ({ invitation }) => {
          await assertSeatAvailable(invitation.organizationId)
        },
        beforeAcceptInvitation: async ({ invitation }) => {
          await assertSeatAvailable(invitation.organizationId)
        },
        beforeAddMember: async ({ member }) => {
          await assertSeatAvailable(member.organizationId)
        },
      },
      // The members UI always surfaces a copyable invite link; email is a
      // bonus when Resend is configured (cloud), not a requirement.
      sendInvitationEmail: async (data) => {
        if (!isEmailConfigured()) return
        const inviteLink = `${env.NEXT_PUBLIC_APP_URL}/invite/${data.id}`
        await sendInvitationEmail(
          data.email,
          data.inviter.user.name,
          data.organization.name,
          inviteLink
        )
      },
    }),
    // Checkout, customer portal, usage ingestion and billing webhooks. Empty in
    // self-hosted mode, so those endpoints simply do not exist there.
    ...billingPlugins(),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7,       // 7 days
    updateAge: 60 * 60 * 24,            // refresh if >1 day old
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,                   // cache for 5 mins
    },
  },

  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],

  databaseHooks: {
    session: {
      create: {
        // Suspended accounts must not be able to sign in through any method
        // (password, social, 2FA) — blocking session creation covers them all.
        before: async (newSession) => {
          const account = await db.query.user.findFirst({
            where: eq(schema.user.id, newSession.userId),
            columns: { isActive: true },
          })
          if (account && !account.isActive) {
            throw new APIError("FORBIDDEN", {
              message: "This account has been suspended. Contact an administrator.",
            })
          }

          // New sessions start in the user's oldest workspace (their personal
          // one) so API requests always have an active workspace to scope to.
          const membership = await db.query.member.findFirst({
            where: eq(schema.member.userId, newSession.userId),
            orderBy: asc(schema.member.createdAt),
            columns: { organizationId: true },
          })
          if (membership) {
            return {
              data: {
                ...newSession,
                activeOrganizationId: membership.organizationId,
              },
            }
          }
        },
        after: async (newSession) => {
          await logAudit({
            userId: newSession.userId,
            action: "user.signed_in",
            metadata: {
              ipAddress: newSession.ipAddress ?? undefined,
              userAgent: newSession.userAgent ?? undefined,
            },
          })
        },
      },
    },
    user: {
      create: {
        before: async (newUser) => {
          // Runs for every way an account can appear — password sign-up,
          // Google/GitHub, admin-created — so the address policy has one home.
          // Disposable domains, domains with no mail service, and aliases of a
          // mailbox that already has an account are all turned away here.
          try {
            await assertEmailAllowed(newUser.email)
            if (!isUsernameOnlyEmail(newUser.email)) {
              await assertNotAliasOfExistingAccount(newUser.email)
            }
          } catch (err) {
            if (err instanceof EmailPolicyError) {
              throw new APIError("BAD_REQUEST", { message: err.message })
            }
            throw err
          }

          // The first account on a fresh install is the setup account — it must
          // be an admin so it can create every other user from the panel.
          const userCount = await db.$count(schema.user)
          if (userCount === 0) {
            return { data: { ...newUser, role: "admin" } }
          }
        },
        after: async (user) => {
          await createPersonalWorkspace(user)

          if (env.DEPLOYMENT_MODE !== "self-hosted") return

          // The personal workspace was just created (or already existed for an
          // invited user) — the default provider belongs to it.
          const membership = await db.query.member.findFirst({
            where: and(eq(schema.member.userId, user.id), eq(schema.member.role, "owner")),
            orderBy: asc(schema.member.createdAt),
            columns: { organizationId: true },
          })
          if (!membership) return

          const existing = await db.$count(
            providerConnections,
            eq(providerConnections.workspaceId, membership.organizationId)
          )
          if (existing > 0) return

          await db.insert(providerConnections).values({
            id: randomUUID(),
            userId: user.id,
            workspaceId: membership.organizationId,
            providerType: "local",
            name: "Local Docker",
            encryptedApiKey: null,
            isDefault: true,
            isActive: true,
            createdAt: new Date(),
          })
        },
      },
    },
  },
})

export type Auth = typeof auth
