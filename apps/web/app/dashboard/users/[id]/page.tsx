"use client"

import { use, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Loader2,
  ServerCrash,
  ShieldAlert,
  KeyRound,
  Pencil,
  Ban,
  UserCheck,
  MonitorSmartphone,
  LogOut,
  History,
  UserPlus,
  UserCog,
  ShieldCheck,
  LogIn,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { useSession } from "@/lib/auth-client"
import {
  useAdminUser,
  suspendUser,
  activateUser,
  revokeUserSession,
  revokeAllUserSessions,
  type UserActivityEvent,
} from "@/hooks/use-admin-users"
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog"
import { EditUserDialog } from "@/components/users/edit-user-dialog"
import { ConfirmDialog } from "@/components/users/confirm-dialog"

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** "Chrome on macOS"-style label from a raw user-agent string. */
function describeUserAgent(ua: string | null) {
  if (!ua) return "Unknown device"
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser"
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS"
  return `${browser} on ${os}`
}

const ACTIVITY_META: Record<string, { label: string; icon: typeof History }> = {
  "user.signed_in": { label: "Signed in", icon: LogIn },
  "user.created": { label: "Account created", icon: UserPlus },
  "user.updated": { label: "Profile updated", icon: UserCog },
  "user.role_changed": { label: "Role changed", icon: ShieldCheck },
  "user.suspended": { label: "Account suspended", icon: Ban },
  "user.reactivated": { label: "Account reactivated", icon: UserCheck },
  "user.password_reset": { label: "Password reset by admin", icon: KeyRound },
  "user.session_revoked": { label: "Session revoked", icon: LogOut },
  "user.sessions_revoked": { label: "All sessions revoked", icon: LogOut },
}

function activityDetail(event: UserActivityEvent): string | null {
  const meta = event.metadata
  if (!meta) return null
  if (event.action === "user.role_changed" && meta.from && meta.to) {
    return `${String(meta.from)} → ${String(meta.to)}`
  }
  if (event.action === "user.updated" && meta.field === "name") {
    return `"${String(meta.from)}" → "${String(meta.to)}"`
  }
  if (event.action === "user.signed_in" && meta.ipAddress) {
    return `from ${String(meta.ipAddress)}`
  }
  return null
}

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: session, isPending } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const currentUserId = session?.user?.id

  const { user, sessions, activity, isLoading, error, refetch } = useAdminUser(id)
  const [editOpen, setEditOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<"suspend" | "revoke-all" | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const isSelf = user?.id === currentUserId

  const handleSuspendToggle = async () => {
    if (!user) return
    setBusy("status")
    try {
      if (user.isActive) {
        await suspendUser(user.id)
        toast.success(`User "${user.username}" suspended`)
      } else {
        await activateUser(user.id)
        toast.success(`User "${user.username}" reactivated`)
      }
      await refetch({ silent: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update user")
    } finally {
      setBusy(null)
    }
  }

  const handleRevokeSession = async (sessionId: string) => {
    if (!user) return
    setBusy(sessionId)
    try {
      await revokeUserSession(user.id, sessionId)
      toast.success("Session revoked")
      await refetch({ silent: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke session")
    } finally {
      setBusy(null)
    }
  }

  const handleRevokeAll = async () => {
    if (!user) return
    setBusy("all-sessions")
    try {
      await revokeAllUserSessions(user.id)
      toast.success("All sessions revoked")
      await refetch({ silent: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke sessions")
    } finally {
      setBusy(null)
    }
  }

  // ── Gate: admins only ──
  if (isPending || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <ShieldAlert className="size-8 text-muted-foreground" />
        <div>
          <h2 className="text-base font-semibold">Admins only</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            You need an admin account to manage users.
          </p>
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <ServerCrash className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error ?? "User not found"}</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/users">Back to users</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Header ── */}
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-3" asChild>
          <Link href="/dashboard/users">
            <ArrowLeft className="size-4" />
            Users
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">{user.name || user.username}</h1>
              <Badge variant={user.role === "admin" ? "purple" : "secondary"}>
                {user.role}
              </Badge>
              <Badge variant={user.isActive ? "success" : "destructive"}>
                {user.isActive ? "active" : "suspended"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {user.username}
              {user.isLocal ? " · username account" : " · email account"}
              {" · created "}
              {formatDateTime(user.createdAt)}
              {!user.isActive && user.suspendedAt
                ? ` · suspended ${formatDateTime(user.suspendedAt)}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
              <KeyRound className="size-4" />
              Reset password
            </Button>
            <Button
              variant={user.isActive ? "destructive" : "default"}
              size="sm"
              onClick={() =>
                user.isActive
                  ? setConfirmAction("suspend")
                  : void handleSuspendToggle()
              }
              disabled={busy === "status" || isSelf}
              title={isSelf ? "You cannot suspend your own account" : undefined}
            >
              {busy === "status" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : user.isActive ? (
                <Ban className="size-4" />
              ) : (
                <UserCheck className="size-4" />
              )}
              {user.isActive ? "Suspend" : "Reactivate"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Active sessions ── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MonitorSmartphone className="size-4 text-muted-foreground" />
              Active sessions
            </CardTitle>
            <CardDescription className="mt-1">
              Where this account is currently signed in.
            </CardDescription>
          </div>
          {sessions.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmAction("revoke-all")}
              disabled={busy === "all-sessions"}
            >
              {busy === "all-sessions" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              Sign out everywhere
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-center">
              <MonitorSmartphone className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No active sessions</p>
              <p className="text-[13px] text-muted-foreground">
                This account is not signed in anywhere.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>IP address</TableHead>
                    <TableHead>Last active</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-16 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {describeUserAgent(s.userAgent)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.ipAddress || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(s.lastActiveAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(s.expiresAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void handleRevokeSession(s.id)}
                          disabled={busy === s.id}
                          title="Revoke session"
                        >
                          {busy === s.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <LogOut className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Activity ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-muted-foreground" />
            Recent activity
          </CardTitle>
          <CardDescription className="mt-1">
            Sign-ins and administrative actions on this account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-center">
              <History className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No activity recorded yet</p>
              <p className="text-[13px] text-muted-foreground">
                Sign-ins and admin actions will appear here.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {activity.map((event) => {
                const meta = ACTIVITY_META[event.action] ?? {
                  label: event.action,
                  icon: History,
                }
                const Icon = meta.icon
                const detail = activityDetail(event)
                return (
                  <li
                    key={event.id}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted">
                      <Icon className="size-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm">{meta.label}</span>
                      {detail ? (
                        <span className="text-sm text-muted-foreground"> · {detail}</span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <EditUserDialog
        user={editOpen ? user : null}
        currentUserId={currentUserId}
        onOpenChange={(open) => {
          if (!open) setEditOpen(false)
        }}
        onSaved={() => void refetch({ silent: true })}
      />

      <ResetPasswordDialog
        user={resetOpen ? user : null}
        onOpenChange={(open) => {
          if (!open) setResetOpen(false)
        }}
      />

      <ConfirmDialog
        open={confirmAction === "suspend"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Suspend user"
        description={`Suspend "${user.username}"? They will be signed out everywhere and blocked from signing in until reactivated.`}
        confirmLabel="Suspend"
        destructive
        onConfirm={handleSuspendToggle}
      />

      <ConfirmDialog
        open={confirmAction === "revoke-all"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Sign out everywhere"
        description={`Sign "${user.username}" out of all ${sessions.length} session${sessions.length === 1 ? "" : "s"}?`}
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={handleRevokeAll}
      />
    </div>
  )
}
