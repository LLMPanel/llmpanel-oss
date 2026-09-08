"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Loader2,
  ServerCrash,
  Users as UsersIcon,
  ShieldAlert,
  KeyRound,
  Pencil,
  Ban,
  UserCheck,
  Search,
  ChevronRight,
  X,
} from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useSession } from "@/lib/auth-client"
import {
  useAdminUsers,
  suspendUser,
  activateUser,
  type AdminUser,
} from "@/hooks/use-admin-users"
import { AddUserDialog } from "@/components/users/add-user-dialog"
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog"
import { EditUserDialog } from "@/components/users/edit-user-dialog"
import { ConfirmDialog } from "@/components/users/confirm-dialog"

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

const PILL = "h-9 gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-transform active:scale-[0.96]"

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-semibold text-foreground">
      {initials || "?"}
    </span>
  )
}

function Pill({ dot, children }: { dot?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
      {dot && <span className={cn("size-1.5 rounded-full", dot)} />}
      {children}
    </span>
  )
}

function RowButton({
  label,
  disabled,
  destructive,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-full text-muted-foreground/70 transition-[transform,color,background-color] duration-100 active:scale-90 disabled:pointer-events-none disabled:opacity-40",
        destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

export default function UsersPage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const currentUserId = session?.user?.id

  const { users, isLoading, error, refetch } = useAdminUsers()
  const [addOpen, setAddOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resetUser, setResetUser] = useState<AdminUser | null>(null)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q),
    )
  }, [users, query])

  const handleSuspendToggle = async (u: AdminUser) => {
    setBusyId(u.id)
    try {
      if (u.isActive) {
        await suspendUser(u.id)
        toast.success(`User "${u.username}" suspended`)
      } else {
        await activateUser(u.id)
        toast.success(`User "${u.username}" reactivated`)
      }
      await refetch({ silent: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update user")
    } finally {
      setBusyId(null)
    }
  }

  // ── Gate: admins only ──
  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="size-6 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">Admins only</h2>
          <p className="mt-1.5 max-w-xs text-[14px] text-muted-foreground">
            You need an admin account to manage users.
          </p>
        </div>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="max-w-3xl space-y-5">
      {/* ── Header ── */}
      <header className="flex items-start justify-between gap-6 px-1 pt-1">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Users</h1>
          <p className="mt-1.5 max-w-xl text-[14px] text-muted-foreground">
            Login accounts, roles and access. Open a user to see their sessions and activity.
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <Button onClick={() => setAddOpen(true)} className={PILL}>
            <Plus className="size-4" strokeWidth={2.5} />
            Add User
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10">
            <ServerCrash className="size-5 text-destructive" />
          </div>
          <p className="text-[13px] text-muted-foreground">{error}</p>
          <Button variant="secondary" size="sm" className="rounded-full" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : users.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="flex flex-col items-center gap-5 px-6 py-20 text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <UsersIcon className="size-6 text-muted-foreground" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">No users yet</h2>
            <p className="mt-1.5 max-w-xs text-[14px] text-muted-foreground">
              Create the first login account to give someone access.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} className={PILL}>
            <Plus className="size-4" strokeWidth={2.5} />
            Add User
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full rounded-[10px] bg-muted pl-9 pr-9 text-[14px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/20 text-background transition-transform active:scale-90"
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            )}
          </div>

          <section
            aria-label="Users"
            className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]"
          >
            {filtered.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">No users match “{query}”.</p>
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {filtered.map((u, i) => {
                  const isSelf = u.id === currentUserId
                  const busy = busyId === u.id
                  return (
                    <motion.li
                      key={u.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.35, delay: Math.min(i, 10) * 0.025 }}
                      className={cn("group flex items-center gap-4 px-5 py-3", !u.isActive && "opacity-60")}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/users/${u.id}`)}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left transition-opacity active:opacity-60"
                      >
                        <Avatar name={u.name || u.username} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{u.username}</p>
                            {isSelf && <span className="text-[12px] text-muted-foreground">you</span>}
                            <Pill>{u.role}</Pill>
                            {!u.isActive && <Pill dot="bg-destructive">Suspended</Pill>}
                          </div>
                          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                            {u.name || "No name"}
                            <span className="text-muted-foreground/40"> · </span>
                            {u.activeSessions
                              ? `Active ${formatDate(u.lastActiveAt)} · ${u.activeSessions} session${u.activeSessions === 1 ? "" : "s"}`
                              : u.lastActiveAt
                                ? `Active ${formatDate(u.lastActiveAt)}`
                                : "Never signed in"}
                            <span className="text-muted-foreground/40"> · </span>
                            Created {formatDate(u.createdAt)}
                          </p>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <RowButton label="Edit" onClick={() => setEditUser(u)} disabled={busy}>
                          <Pencil className="size-4" />
                        </RowButton>
                        <RowButton label="Reset password" onClick={() => setResetUser(u)} disabled={busy}>
                          <KeyRound className="size-4" />
                        </RowButton>
                        <RowButton
                          label={isSelf ? "You can’t suspend your own account" : u.isActive ? "Suspend" : "Reactivate"}
                          destructive={u.isActive}
                          disabled={busy || isSelf}
                          onClick={() => (u.isActive ? setSuspendTarget(u) : void handleSuspendToggle(u))}
                        >
                          {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : u.isActive ? (
                            <Ban className="size-4" />
                          ) : (
                            <UserCheck className="size-4" />
                          )}
                        </RowButton>
                        <ChevronRight className="ml-1 size-4 text-muted-foreground/40" />
                      </div>
                    </motion.li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      <AddUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => void refetch()}
      />

      <ResetPasswordDialog
        user={resetUser}
        onOpenChange={(open) => {
          if (!open) setResetUser(null)
        }}
      />

      <EditUserDialog
        user={editUser}
        currentUserId={currentUserId}
        onOpenChange={(open) => {
          if (!open) setEditUser(null)
        }}
        onSaved={() => void refetch({ silent: true })}
      />

      <ConfirmDialog
        open={Boolean(suspendTarget)}
        onOpenChange={(open) => {
          if (!open) setSuspendTarget(null)
        }}
        title="Suspend user"
        description={`Suspend "${suspendTarget?.username}"? They will be signed out everywhere and blocked from signing in until reactivated.`}
        confirmLabel="Suspend"
        destructive
        onConfirm={async () => {
          if (suspendTarget) await handleSuspendToggle(suspendTarget)
        }}
      />
    </div>
    </MotionConfig>
  )
}
