// apps/api/src/routes/admin.route.ts
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { adminAuth } from "../middlewares/admin-auth.middleware"
import { auth } from "../lib/auth"
import { db } from "@llmpanel/db"
import { models, user, session, auditLogs, waitlistSignups } from "@llmpanel/db/schema"
import { eq, desc, asc, gt, count, max } from "drizzle-orm"
import { randomUUID } from "crypto"
import { logAudit } from "../services/audit-log.service"
import { USERNAME_EMAIL_DOMAIN } from "../services/email-policy.service"

/**
 * Admin-created accounts have no real email — we synthesize one from the
 * username so Better Auth (which requires an email) works unchanged. The UI
 * strips this suffix to show the bare username, and the login form re-appends
 * it when a user signs in with just their username.
 * The domain itself lives in email-policy.service so the sign-up gates can
 * exempt it.
 */
const usernameToEmail = (username: string) =>
  `${username.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`

/** Returns the bare username for synthetic emails, else the email itself. */
const emailToUsername = (email: string) =>
  email.endsWith(`@${USERNAME_EMAIL_DOMAIN}`)
    ? email.slice(0, -(USERNAME_EMAIL_DOMAIN.length + 1))
    : email

const CreateUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32)
    .regex(
      /^[a-z0-9._-]+$/,
      "Use only lowercase letters, numbers, and . _ -",
    ),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  name: z.string().trim().max(64).optional(),
  role: z.enum(["user", "admin"]).default("user"),
})

const ResetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
})

const UpdateUserSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(64).optional(),
  role: z.enum(["user", "admin"]).optional(),
})

/** API shape shared by the list, detail, and mutation responses. */
const toAdminUser = (u: typeof user.$inferSelect) => ({
  id: u.id,
  username: emailToUsername(u.email),
  // `isLocal` distinguishes admin-created username accounts from
  // real email/social sign-ups so the UI can label them.
  isLocal: u.email.endsWith(`@${USERNAME_EMAIL_DOMAIN}`),
  name: u.name,
  role: u.role ?? "user",
  isActive: u.isActive,
  suspendedAt: u.suspendedAt,
  createdAt: u.createdAt,
})

const CreateModelSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  family: z.string().min(1),
  huggingfaceId: z.string().min(1),
  description: z.string().optional(),
  minVram: z.number().positive(),
  tags: z.array(z.string()).default([]),
  supportedQuantizations: z.array(
    z.enum(["fp16", "int8", "int4", "gguf"])
  ).default(["fp16"]),
})

const UpdateModelSchema = CreateModelSchema.partial()

export const adminRoute = new Hono<{
  Variables: { user: { id: string }; session: unknown }
}>()
  .use(adminAuth)

  // ── User Management ─────────────────────────────────────────────────

  // GET /api/v1/admin/users
  .get("/users", async (c) => {
    const rows = await db.query.user.findMany({
      orderBy: [desc(user.createdAt)],
    })

    // Live-session stats per user, for "last active" and session counts.
    const sessionStats = await db
      .select({
        userId: session.userId,
        activeSessions: count(),
        lastActiveAt: max(session.updatedAt),
      })
      .from(session)
      .where(gt(session.expiresAt, new Date()))
      .groupBy(session.userId)

    const statsByUser = new Map(sessionStats.map((s) => [s.userId, s]))

    return c.json({
      users: rows.map((u) => ({
        ...toAdminUser(u),
        activeSessions: statsByUser.get(u.id)?.activeSessions ?? 0,
        lastActiveAt: statsByUser.get(u.id)?.lastActiveAt ?? null,
      })),
    })
  })

  // POST /api/v1/admin/users
  .post("/users", zValidator("json", CreateUserSchema), async (c) => {
    const body = c.req.valid("json")
    const email = usernameToEmail(body.username)

    const existing = await db.query.user.findFirst({
      where: eq(user.email, email),
    })
    if (existing) {
      return c.json({ error: "A user with this username already exists" }, 409)
    }

    // Let Better Auth create the user + credential account so the password is
    // hashed with the same algorithm the login flow verifies against.
    let createdId: string
    try {
      const result = await auth.api.signUpEmail({
        body: {
          email,
          password: body.password,
          name: body.name?.trim() || body.username,
        },
      })
      createdId = result.user.id
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create user"
      return c.json({ error: message }, 400)
    }

    // `role` is locked from client input in the auth config, so set it here.
    // The synthetic `@users.local` address can never receive a verification
    // code, and sign-in requires a verified email once a provider is set up —
    // an admin vouching for the account is the verification.
    await db
      .update(user)
      .set({ emailVerified: true, ...(body.role !== "user" ? { role: body.role } : {}) })
      .where(eq(user.id, createdId))

    await logAudit({
      userId: createdId,
      action: "user.created",
      metadata: { by: c.get("user").id, role: body.role },
    })

    return c.json(
      {
        user: {
          id: createdId,
          username: body.username.toLowerCase(),
          name: body.name?.trim() || body.username,
          role: body.role,
        },
      },
      201,
    )
  })

  // GET /api/v1/admin/users/:id
  .get("/users/:id", async (c) => {
    const id = c.req.param("id")

    const target = await db.query.user.findFirst({ where: eq(user.id, id) })
    if (!target) {
      return c.json({ error: "User not found" }, 404)
    }

    return c.json({ user: toAdminUser(target) })
  })

  // PATCH /api/v1/admin/users/:id — edit name and/or role
  .patch("/users/:id", zValidator("json", UpdateUserSchema), async (c) => {
    const id = c.req.param("id")
    const body = c.req.valid("json")
    const currentUser = c.get("user")

    const target = await db.query.user.findFirst({ where: eq(user.id, id) })
    if (!target) {
      return c.json({ error: "User not found" }, 404)
    }

    const currentRole = target.role ?? "user"
    const roleChanged = body.role !== undefined && body.role !== currentRole
    const nameChanged = body.name !== undefined && body.name !== target.name

    // An admin demoting themselves could leave the panel with no admin able
    // to manage users — role changes always go through another admin.
    if (roleChanged && id === currentUser.id) {
      return c.json({ error: "You cannot change your own role" }, 400)
    }

    if (roleChanged || nameChanged) {
      await db
        .update(user)
        .set({
          ...(nameChanged && { name: body.name }),
          ...(roleChanged && { role: body.role }),
        })
        .where(eq(user.id, id))

      if (roleChanged) {
        await logAudit({
          userId: id,
          action: "user.role_changed",
          metadata: { by: currentUser.id, from: currentRole, to: body.role },
        })
      }
      if (nameChanged) {
        await logAudit({
          userId: id,
          action: "user.updated",
          metadata: { by: currentUser.id, field: "name", from: target.name, to: body.name },
        })
      }
    }

    const updated = await db.query.user.findFirst({ where: eq(user.id, id) })
    return c.json({ user: toAdminUser(updated!) })
  })

  // POST /api/v1/admin/users/:id/suspend — soft delete: block sign-in, keep data
  .post("/users/:id/suspend", async (c) => {
    const id = c.req.param("id")
    const currentUser = c.get("user")

    if (id === currentUser.id) {
      return c.json({ error: "You cannot suspend your own account" }, 400)
    }

    const target = await db.query.user.findFirst({ where: eq(user.id, id) })
    if (!target) {
      return c.json({ error: "User not found" }, 404)
    }
    if (!target.isActive) {
      return c.json({ error: "User is already suspended" }, 400)
    }

    await db
      .update(user)
      .set({ isActive: false, suspendedAt: new Date() })
      .where(eq(user.id, id))

    // Kill live sessions — suspension must take effect immediately, not
    // whenever their current session happens to expire.
    await db.delete(session).where(eq(session.userId, id))

    await logAudit({
      userId: id,
      action: "user.suspended",
      metadata: { by: currentUser.id },
    })

    return c.json({ success: true })
  })

  // POST /api/v1/admin/users/:id/activate — lift a suspension
  .post("/users/:id/activate", async (c) => {
    const id = c.req.param("id")
    const currentUser = c.get("user")

    const target = await db.query.user.findFirst({ where: eq(user.id, id) })
    if (!target) {
      return c.json({ error: "User not found" }, 404)
    }
    if (target.isActive) {
      return c.json({ error: "User is not suspended" }, 400)
    }

    await db
      .update(user)
      .set({ isActive: true, suspendedAt: null })
      .where(eq(user.id, id))

    await logAudit({
      userId: id,
      action: "user.reactivated",
      metadata: { by: currentUser.id },
    })

    return c.json({ success: true })
  })

  // GET /api/v1/admin/users/:id/sessions — live sessions for a user
  .get("/users/:id/sessions", async (c) => {
    const id = c.req.param("id")

    const target = await db.query.user.findFirst({ where: eq(user.id, id) })
    if (!target) {
      return c.json({ error: "User not found" }, 404)
    }

    const rows = await db.query.session.findMany({
      where: eq(session.userId, id),
      orderBy: [desc(session.updatedAt)],
    })

    const now = Date.now()
    return c.json({
      sessions: rows
        .filter((s) => s.expiresAt.getTime() > now)
        .map((s) => ({
          id: s.id,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          createdAt: s.createdAt,
          lastActiveAt: s.updatedAt,
          expiresAt: s.expiresAt,
        })),
    })
  })

  // DELETE /api/v1/admin/users/:id/sessions — revoke ALL of a user's sessions
  .delete("/users/:id/sessions", async (c) => {
    const id = c.req.param("id")
    const currentUser = c.get("user")

    const target = await db.query.user.findFirst({ where: eq(user.id, id) })
    if (!target) {
      return c.json({ error: "User not found" }, 404)
    }

    await db.delete(session).where(eq(session.userId, id))

    await logAudit({
      userId: id,
      action: "user.sessions_revoked",
      metadata: { by: currentUser.id },
    })

    return c.json({ success: true })
  })

  // DELETE /api/v1/admin/users/:id/sessions/:sessionId — revoke one session
  .delete("/users/:id/sessions/:sessionId", async (c) => {
    const id = c.req.param("id")
    const sessionId = c.req.param("sessionId")
    const currentUser = c.get("user")

    const target = await db.query.session.findFirst({
      where: eq(session.id, sessionId),
    })
    if (!target || target.userId !== id) {
      return c.json({ error: "Session not found" }, 404)
    }

    await db.delete(session).where(eq(session.id, sessionId))

    await logAudit({
      userId: id,
      action: "user.session_revoked",
      resourceType: "session",
      resourceId: sessionId,
      metadata: { by: currentUser.id, ipAddress: target.ipAddress ?? undefined },
    })

    return c.json({ success: true })
  })

  // GET /api/v1/admin/users/:id/activity — recent audit events for a user
  .get("/users/:id/activity", async (c) => {
    const id = c.req.param("id")

    const target = await db.query.user.findFirst({ where: eq(user.id, id) })
    if (!target) {
      return c.json({ error: "User not found" }, 404)
    }

    const rows = await db.query.auditLogs.findMany({
      where: eq(auditLogs.userId, id),
      orderBy: [desc(auditLogs.createdAt)],
      limit: 50,
    })

    return c.json({
      activity: rows.map((r) => ({
        id: r.id,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null,
        createdAt: r.createdAt,
      })),
    })
  })

  // POST /api/v1/admin/users/:id/password
  .post(
    "/users/:id/password",
    zValidator("json", ResetPasswordSchema),
    async (c) => {
      const id = c.req.param("id")
      const { password } = c.req.valid("json")

      const target = await db.query.user.findFirst({ where: eq(user.id, id) })
      if (!target) {
        return c.json({ error: "User not found" }, 404)
      }

      // Hash with Better Auth's configured algorithm and write to the
      // credential account so the new password verifies on next login.
      const ctx = await auth.$context
      const hashed = await ctx.password.hash(password)
      await ctx.internalAdapter.updatePassword(id, hashed)

      // Force re-login everywhere — old sessions outlive a password change
      // by default, which we don't want for an admin-initiated reset.
      await db.delete(session).where(eq(session.userId, id))

      await logAudit({
        userId: id,
        action: "user.password_reset",
        metadata: { by: c.get("user").id },
      })

      return c.json({ success: true })
    },
  )

  // ── Model Registry Management ───────────────────────────────────────

  // GET /api/v1/admin/models
  .get("/models", async (c) => {
    const allModels = await db.query.models.findMany({
      orderBy: [models.family, models.name],
    })

    return c.json({
      models: allModels.map((m) => ({
        ...m,
        tags: JSON.parse(m.tags) as string[],
        supportedQuantizations: JSON.parse(
          m.supportedQuantizations
        ) as string[],
      })),
    })
  })

  // POST /api/v1/admin/models
  .post("/models", zValidator("json", CreateModelSchema), async (c) => {
    const body = c.req.valid("json")

    // Check slug is unique
    const existing = await db.query.models.findFirst({
      where: eq(models.slug, body.slug),
    })

    if (existing) {
      return c.json({ error: "Model with this slug already exists" }, 409)
    }

    const [model] = await db.insert(models).values({
      id: randomUUID(),
      name: body.name,
      slug: body.slug,
      family: body.family,
      huggingfaceId: body.huggingfaceId,
      description: body.description ?? null,
      minVram: body.minVram,
      tags: JSON.stringify(body.tags),
      supportedQuantizations: JSON.stringify(body.supportedQuantizations),
      isActive: true,
      createdAt: new Date(),
    }).returning()

    return c.json({ model }, 201)
  })

  // PUT /api/v1/admin/models/:id
  .put("/models/:id", zValidator("json", UpdateModelSchema), async (c) => {
    const id = c.req.param("id")
    const body = c.req.valid("json")

    const existing = await db.query.models.findFirst({
      where: eq(models.id, id),
    })

    if (!existing) {
      return c.json({ error: "Model not found" }, 404)
    }

    await db.update(models)
      .set({
        ...(body.name && { name: body.name }),
        ...(body.slug && { slug: body.slug }),
        ...(body.family && { family: body.family }),
        ...(body.huggingfaceId && { huggingfaceId: body.huggingfaceId }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.minVram && { minVram: body.minVram }),
        ...(body.tags && { tags: JSON.stringify(body.tags) }),
        ...(body.supportedQuantizations && {
          supportedQuantizations: JSON.stringify(body.supportedQuantizations),
        }),
      })
      .where(eq(models.id, id))

    return c.json({ success: true })
  })

  // DELETE /api/v1/admin/models/:id
  .delete("/models/:id", async (c) => {
    const id = c.req.param("id")

    const existing = await db.query.models.findFirst({
      where: eq(models.id, id),
    })

    if (!existing) {
      return c.json({ error: "Model not found" }, 404)
    }

    // Soft delete — keep record for historical deployments
    await db.update(models)
      .set({ isActive: false })
      .where(eq(models.id, id))

    return c.json({ success: true })
  })

  // ── Waitlist ────────────────────────────────────────────────────────

  // GET /api/v1/admin/waitlist — founder-pricing signups from the marketing site
  .get("/waitlist", async (c) => {
    const rows = await db.query.waitlistSignups.findMany({
      orderBy: [desc(waitlistSignups.createdAt)],
    })
    return c.json({ signups: rows, total: rows.length })
  })

  // GET /api/v1/admin/waitlist/export.csv — same list as a spreadsheet download
  .get("/waitlist/export.csv", async (c) => {
    const rows = await db.query.waitlistSignups.findMany({
      orderBy: [asc(waitlistSignups.createdAt)],
    })
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
    const csv = [
      "email,source,signed_up_at",
      ...rows.map((r) =>
        [escape(r.email), escape(r.source ?? ""), r.createdAt.toISOString()].join(","),
      ),
    ].join("\n")
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="llmpanel-waitlist.csv"',
    })
  })

  // ── System Health ───────────────────────────────────────────────────

  // GET /api/v1/admin/system
  .get("/system", async (c) => {
    const { execSync } = await import("child_process")

    let dockerStatus = "unknown"
    try {
      execSync("docker info", { stdio: "ignore" })
      dockerStatus = "running"
    } catch {
      dockerStatus = "not running"
    }

    let gpuStatus = "unknown"
    let gpuInfo: string[] = []
    try {
      const output = execSync(
        "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader"
      ).toString()
      gpuInfo = output.trim().split("\n")
      gpuStatus = "available"
    } catch {
      gpuStatus = "not available"
    }

    const memUsage = process.memoryUsage()

    return c.json({
      system: {
        docker: dockerStatus,
        gpu: gpuStatus,
        gpuInfo,
        nodeVersion: process.version,
        uptime: Math.floor(process.uptime()),
        memory: {
          heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
          rssMb: Math.round(memUsage.rss / 1024 / 1024),
        },
      },
    })
  })