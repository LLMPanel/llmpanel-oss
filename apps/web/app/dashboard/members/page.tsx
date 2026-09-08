"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowUpCircle,
  Loader2,
  LogOut,
  ServerCrash,
  UserMinus,
  UserPlus,
} from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/users/confirm-dialog"
import { CopyInviteLinkButton } from "@/components/members/invite-link"
import { InviteMemberDialog } from "@/components/members/invite-member-dialog"
import { useBilling } from "@/hooks/use-billing"
import {
  organization,
  useActiveOrganization,
  useSession,
} from "@/lib/auth-client"
import {
  ROLE_LABELS,
  WORKSPACE_ROLES,
  formatWorkspaceDate,
  isWorkspaceRole,
  type WorkspaceRole,
} from "@/lib/workspace"

type ActiveWorkspace = NonNullable<
  ReturnType<typeof useActiveOrganization>["data"]
>
type WorkspaceMember = ActiveWorkspace["members"][number]
type WorkspaceInvitation = ActiveWorkspace["invitations"][number]

const PILL = "h-9 gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-transform active:scale-[0.96]"

/** Inset-grouped section: sentence-case title + count, hairline-ring card. */
function Group({
  title,
  count,
  index,
  children,
}: {
  title: string
  count: number
  index: number
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4, delay: index * 0.04 }}
      className="space-y-1.5"
    >
      <div className="flex items-baseline justify-between px-3">
        <h2 className="text-[12px] font-medium text-muted-foreground">{title}</h2>
        <span className="text-[12px] tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
        {children}
      </div>
    </motion.section>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s@.]+/)
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

function RolePill({ role }: { role: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-[12px] font-medium text-muted-foreground">
      {ROLE_LABELS[role as WorkspaceRole] ?? role}
    </span>
  )
}

const LAST_OWNER_MESSAGE =
  "A workspace needs at least one owner. Promote someone else first."

function displayName(member: WorkspaceMember): string {
  return member.user.name?.trim() || member.user.email
}

function errorMessage(
  error: { message?: string | null } | null | undefined,
  fallback: string
): string {
  return error?.message ?? fallback
}

export default function MembersPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const {
    data: workspace,
    isPending,
    error,
    refetch,
  } = useActiveOrganization()

  // null on self-hosted installs, where seats are not a plan entitlement.
  const { seats } = useBilling()

  const [inviteOpen, setInviteOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null)
  const [cancelTarget, setCancelTarget] =
    useState<WorkspaceInvitation | null>(null)

  const members: WorkspaceMember[] = useMemo(
    () => workspace?.members ?? [],
    [workspace]
  )
  const pendingInvitations: WorkspaceInvitation[] = useMemo(
    () => (workspace?.invitations ?? []).filter((i) => i.status === "pending"),
    [workspace]
  )

  const currentUserId = session?.user?.id
  const currentMember = members.find((m) => m.userId === currentUserId)
  const isOwner = currentMember?.role === "owner"
  const ownerCount = members.filter((m) => m.role === "owner").length
  const workspaceName = workspace?.name ?? "this workspace"

  /** Losing this member's owner seat would leave the workspace ownerless. */
  const isLastOwner = (member: WorkspaceMember) =>
    member.role === "owner" && ownerCount <= 1

  const afterMutation = async () => {
    await refetch()
    // Roles gate what the rest of the dashboard is allowed to do, so any
    // membership change invalidates the scoped API caches too.
    await queryClient.invalidateQueries()
  }

  const handleRoleChange = async (
    member: WorkspaceMember,
    nextRole: WorkspaceRole
  ) => {
    if (member.role === nextRole) return
    if (nextRole !== "owner" && isLastOwner(member)) {
      toast.error(LAST_OWNER_MESSAGE)
      return
    }

    setBusyId(member.id)
    try {
      const result = await organization.updateMemberRole({
        memberId: member.id,
        role: nextRole,
      })
      if (result.error) {
        toast.error(errorMessage(result.error, "Could not update the role"))
        return
      }
      toast.success(
        `${displayName(member)} is now ${ROLE_LABELS[nextRole].toLowerCase()}`
      )
      await afterMutation()
    } catch {
      toast.error("Could not reach the server. Please try again.")
    } finally {
      setBusyId(null)
    }
  }

  const handleRemove = async (member: WorkspaceMember) => {
    if (isLastOwner(member)) {
      toast.error(LAST_OWNER_MESSAGE)
      return
    }

    const isSelf = member.userId === currentUserId
    setBusyId(member.id)
    try {
      const result = isSelf
        ? await organization.leave({ organizationId: member.organizationId })
        : await organization.removeMember({ memberIdOrEmail: member.id })

      if (result.error) {
        toast.error(
          errorMessage(
            result.error,
            isSelf ? "Could not leave the workspace" : "Could not remove the member"
          )
        )
        return
      }

      if (isSelf) {
        toast.success(`You left ${workspaceName}`)
        await queryClient.invalidateQueries()
        router.replace("/dashboard")
        router.refresh()
        return
      }

      toast.success(`${displayName(member)} removed`)
      await afterMutation()
    } catch {
      toast.error("Could not reach the server. Please try again.")
    } finally {
      setBusyId(null)
    }
  }

  const handleCancelInvitation = async (invitation: WorkspaceInvitation) => {
    setBusyId(invitation.id)
    try {
      const result = await organization.cancelInvitation({
        invitationId: invitation.id,
      })
      if (result.error) {
        toast.error(
          errorMessage(result.error, "Could not cancel the invitation")
        )
        return
      }
      toast.success(`Invitation to ${invitation.email} cancelled`)
      await refetch()
    } catch {
      toast.error("Could not reach the server. Please try again.")
    } finally {
      setBusyId(null)
    }
  }

  // ── Loading / error ──
  if (isPending && !workspace) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !workspace) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <ServerCrash className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {error?.message ?? "No active workspace."}
        </p>
        <Button variant="secondary" size="sm" className="rounded-full" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  // Seats are a plan entitlement in cloud mode. `seats` is null on self-hosted,
  // where a workspace can have as many people in it as it likes.
  const seatLocked = Boolean(seats && !seats.canAddMember)

  const inviteButton = (
    <Button onClick={() => setInviteOpen(true)} disabled={!isOwner || seatLocked} className={PILL}>
      <UserPlus className="size-4" />
      Invite
    </Button>
  )

  return (
    <MotionConfig reducedMotion="user">
    <div className="max-w-3xl space-y-6">
      {/* ── Header ── */}
      <header className="flex items-start justify-between gap-6 px-1 pt-1">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Members</h1>
          <p className="mt-1.5 max-w-xl text-[14px] text-muted-foreground">
            People with access to <span className="font-medium text-foreground">{workspace.name}</span>.
            Owners manage the workspace, members ship deployments, viewers are read‑only.
          </p>
        </div>
        <div className="shrink-0 pt-1">
        {seatLocked && isOwner ? (
          <Button asChild className={PILL}>
            <Link href="/dashboard/billing">
              <ArrowUpCircle className="size-4" />
              Upgrade to Team
            </Link>
          </Button>
        ) : isOwner ? (
          inviteButton
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>{inviteButton}</span>
            </TooltipTrigger>
            <TooltipContent side="left">Only workspace owners can invite members.</TooltipContent>
          </Tooltip>
        )}
        </div>
      </header>

      {/* The page stays readable when locked — you can still see who is in the
          workspace and manage them. Only adding people is gated. */}
      {seatLocked && (
        <div className="rounded-2xl bg-warning/10 px-4 py-3 text-[13px] leading-[1.45] text-warning">
          <span className="font-medium">Inviting teammates is a Team plan feature. </span>
          {seats?.denialReason ?? "Upgrade to Team to invite people to this workspace."}
        </div>
      )}

      {/* ── Members ── */}
      <Group title="Members" count={members.length} index={0}>
        <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId
            const lastOwner = isLastOwner(member)
            return (
              <li key={member.id} className="flex items-center gap-4 px-5 py-3">
                <Avatar name={displayName(member)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                    {displayName(member)}
                    {isSelf && <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">you</span>}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {member.user.email}
                    <span className="text-muted-foreground/40"> · </span>
                    Joined {formatWorkspaceDate(member.createdAt)}
                  </p>
                </div>

                {isOwner ? (
                  <Select
                    value={member.role}
                    disabled={busyId === member.id}
                    onValueChange={(value) => {
                      if (isWorkspaceRole(value)) void handleRoleChange(member, value)
                    }}
                  >
                    <SelectTrigger className="h-8 w-28 rounded-[9px] border-0 bg-muted text-[13px] shadow-none focus-visible:ring-2 focus-visible:ring-ring/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKSPACE_ROLES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {ROLE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <RolePill role={member.role} />
                )}

                {isOwner && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <button
                          type="button"
                          aria-label={isSelf ? "Leave workspace" : "Remove member"}
                          disabled={busyId === member.id || lastOwner}
                          onClick={() => setRemoveTarget(member)}
                          className={cn(
                            "flex size-8 items-center justify-center rounded-full text-muted-foreground/70",
                            "transition-[transform,color,background-color] duration-100 hover:bg-destructive/10 hover:text-destructive active:scale-90",
                            "disabled:pointer-events-none disabled:opacity-40"
                          )}
                        >
                          {busyId === member.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : isSelf ? (
                            <LogOut className="size-4" />
                          ) : (
                            <UserMinus className="size-4" />
                          )}
                        </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {lastOwner ? LAST_OWNER_MESSAGE : isSelf ? "Leave workspace" : "Remove member"}
                    </TooltipContent>
                  </Tooltip>
                )}
              </li>
            )
          })}
        </ul>
      </Group>

      {/* ── Pending invitations ── */}
      <Group title="Pending invitations" count={pendingInvitations.length} index={1}>
        {pendingInvitations.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
            {isOwner ? "No pending invitations. Invite someone to get started." : "No pending invitations."}
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {pendingInvitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-4 px-5 py-3">
                <Avatar name={invitation.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{invitation.email}</p>
                  <p className="text-[12px] text-muted-foreground">
                    Expires {formatWorkspaceDate(invitation.expiresAt)}
                  </p>
                </div>
                <RolePill role={invitation.role} />
                <div className="flex items-center gap-1">
                  <CopyInviteLinkButton
                    invitationId={invitation.id}
                    className="h-7 rounded-full bg-muted px-2.5 text-[12px] font-medium hover:bg-accent"
                  />
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full px-2.5 text-[12px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busyId === invitation.id}
                      onClick={() => setCancelTarget(invitation)}
                    >
                      {busyId === invitation.id && <Loader2 className="size-3.5 animate-spin" />}
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Group>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        workspaceName={workspace.name}
        onInvited={() => void refetch()}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title={
          removeTarget?.userId === currentUserId
            ? "Leave workspace"
            : "Remove member"
        }
        description={
          removeTarget?.userId === currentUserId
            ? `Leave "${workspaceName}"? You will lose access to its deployments, providers, and keys until someone invites you back.`
            : `Remove ${removeTarget ? displayName(removeTarget) : "this member"} from "${workspaceName}"? They immediately lose access to everything in it.`
        }
        confirmLabel={
          removeTarget?.userId === currentUserId ? "Leave" : "Remove"
        }
        destructive
        onConfirm={async () => {
          if (removeTarget) await handleRemove(removeTarget)
        }}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null)
        }}
        title="Cancel invitation"
        description={`Cancel the invitation to ${cancelTarget?.email}? Their invite link stops working immediately.`}
        confirmLabel="Cancel invitation"
        destructive
        onConfirm={async () => {
          if (cancelTarget) await handleCancelInvitation(cancelTarget)
        }}
      />
    </div>
    </MotionConfig>
  )
}
