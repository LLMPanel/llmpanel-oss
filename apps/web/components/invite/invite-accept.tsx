"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { motion, type Variants } from "motion/react"
import { AlertCircle, Check, Loader2, LogOut, MailQuestion } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { authClient, organization, useSession } from "@/lib/auth-client"
import { clearSignedInHint } from "@/lib/signed-in-hint"
import { ROLE_LABELS, roleBadgeVariant, type WorkspaceRole } from "@/lib/workspace"

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring", duration: 0.5, bounce: 0 },
  },
}

interface Invitation {
  id: string
  email: string
  role: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  inviterEmail: string
}

type Status =
  | { kind: "loading" }
  | { kind: "redirecting" }
  | { kind: "ready"; invitation: Invitation }
  | { kind: "accepted"; workspaceName: string }
  | { kind: "declined" }
  | { kind: "wrong-email" }
  | { kind: "invalid"; message: string }

function roleLabel(role: string): string {
  return ROLE_LABELS[role as WorkspaceRole] ?? role
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden p-6 antialiased">
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute -top-40 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-8">
        <img
          src="/logo/llmpanel_logo_low.png"
          alt="LLMPanel"
          className="h-6 w-auto object-contain invert dark:invert-0"
        />
        {children}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      {children}
    </div>
  )
}

export function InviteAccept({ invitationId }: { invitationId: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session, isPending: sessionPending } = useSession()
  const [status, setStatus] = useState<Status>({ kind: "loading" })
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null)

  const sessionUserId = session?.user?.id ?? null
  const sessionEmail = session?.user?.email ?? null
  const destination = `/invite/${invitationId}`

  useEffect(() => {
    if (sessionPending) return

    // Not signed in: keep the destination so the login form lands back here.
    if (!sessionUserId) {
      setStatus({ kind: "redirecting" })
      router.replace(`/login?redirect=${encodeURIComponent(destination)}`)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const result = await organization.getInvitation({
          query: { id: invitationId },
        })
        if (cancelled) return

        if (result.error || !result.data) {
          // 403 is better-auth's "you are not the recipient" — the invite is
          // real but belongs to another email. Everything else (expired,
          // already accepted, cancelled, bogus id) comes back as 400.
          if (result.error?.status === 403) {
            setStatus({ kind: "wrong-email" })
          } else {
            setStatus({
              kind: "invalid",
              message:
                "This invitation is no longer valid. It may have expired, been cancelled, or already been used.",
            })
          }
          return
        }

        setStatus({ kind: "ready", invitation: result.data as Invitation })
      } catch {
        if (cancelled) return
        setStatus({
          kind: "invalid",
          message: "Could not reach the server. Please try again.",
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sessionPending, sessionUserId, invitationId, destination, router])

  const handleAccept = useCallback(
    async (invitation: Invitation) => {
      setBusy("accept")
      try {
        const accepted = await organization.acceptInvitation({
          invitationId: invitation.id,
        })
        if (accepted.error) {
          setStatus({
            kind: "invalid",
            message:
              accepted.error.message ?? "Could not accept this invitation.",
          })
          return
        }

        // Land the user inside the workspace they just joined.
        await organization.setActive({
          organizationId: invitation.organizationId,
        })
        await queryClient.invalidateQueries()

        setStatus({
          kind: "accepted",
          workspaceName: invitation.organizationName,
        })
        globalThis.setTimeout(() => {
          router.replace("/dashboard")
          router.refresh()
        }, 900)
      } catch {
        setStatus({
          kind: "invalid",
          message: "Could not reach the server. Please try again.",
        })
      } finally {
        setBusy(null)
      }
    },
    [queryClient, router]
  )

  const handleDecline = useCallback(async (invitation: Invitation) => {
    setBusy("decline")
    try {
      const rejected = await organization.rejectInvitation({
        invitationId: invitation.id,
      })
      if (rejected.error) {
        setStatus({
          kind: "invalid",
          message: rejected.error.message ?? "Could not decline this invitation.",
        })
        return
      }
      setStatus({ kind: "declined" })
    } catch {
      setStatus({
        kind: "invalid",
        message: "Could not reach the server. Please try again.",
      })
    } finally {
      setBusy(null)
    }
  }, [])

  const handleSignOut = async () => {
    await authClient.signOut()
    clearSignedInHint()
    globalThis.location.href = `/login?redirect=${encodeURIComponent(destination)}`
  }

  if (sessionPending || status.kind === "loading" || status.kind === "redirecting") {
    return (
      <Shell>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Shell>
    )
  }

  if (status.kind === "wrong-email") {
    return (
      <Shell>
        <Centered>
          <div className="flex size-11 items-center justify-center rounded-full border bg-background shadow-xs">
            <MailQuestion className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-balance">
            This invitation is for a different account
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            You are signed in as{" "}
            <span className="font-medium text-foreground">{sessionEmail}</span>,
            but this invitation was sent to another email address. Sign in with
            the invited account to accept it.
          </p>
          <div className="mt-2 flex w-full flex-col gap-2">
            <Button onClick={() => void handleSignOut()} className="w-full">
              <LogOut />
              Sign out and switch account
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => router.replace("/dashboard")}
            >
              Back to dashboard
            </Button>
          </div>
        </Centered>
      </Shell>
    )
  }

  if (status.kind === "invalid") {
    return (
      <Shell>
        <Centered>
          <div className="flex size-11 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10">
            <AlertCircle className="size-5 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-balance">
            Invitation unavailable
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {status.message}
          </p>
          <Button
            className="mt-2 w-full"
            onClick={() => router.replace("/dashboard")}
          >
            Go to dashboard
          </Button>
        </Centered>
      </Shell>
    )
  }

  if (status.kind === "accepted") {
    return (
      <Shell>
        <Centered>
          <div className="flex size-11 items-center justify-center rounded-full border border-success/25 bg-success/10">
            <Check className="size-5 text-success" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-balance">
            You joined {status.workspaceName}
          </h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Taking you to the dashboard…
          </p>
        </Centered>
      </Shell>
    )
  }

  if (status.kind === "declined") {
    return (
      <Shell>
        <Centered>
          <div className="flex size-11 items-center justify-center rounded-full border bg-background shadow-xs">
            <Check className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-balance">
            Invitation declined
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            No problem — nothing was shared with you.
          </p>
          <Button
            className="mt-2 w-full"
            onClick={() => router.replace("/dashboard")}
          >
            Go to dashboard
          </Button>
        </Centered>
      </Shell>
    )
  }

  const { invitation } = status

  return (
    <Shell>
      <motion.div
        variants={container}
        initial="hidden"
        animate="visible"
        className="flex w-full flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm"
      >
        <motion.div variants={item} className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-balance">
            Join {invitation.organizationName}
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            <span className="font-medium text-foreground">
              {invitation.inviterEmail}
            </span>{" "}
            invited you to the{" "}
            <span className="font-medium text-foreground">
              {invitation.organizationName}
            </span>{" "}
            workspace on LLMPanel.
          </p>
        </motion.div>

        <motion.dl
          variants={item}
          className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 rounded-lg border bg-muted/30 px-4 py-3 text-sm"
        >
          <dt className="text-muted-foreground">Role</dt>
          <dd>
            <Badge variant={roleBadgeVariant(invitation.role)}>
              {roleLabel(invitation.role)}
            </Badge>
          </dd>
          <dt className="text-muted-foreground">Invited</dt>
          <dd className="truncate font-medium">{invitation.email}</dd>
        </motion.dl>

        <motion.div variants={item} className="flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full active:scale-[0.96]"
            disabled={busy !== null}
            onClick={() => void handleAccept(invitation)}
          >
            {busy === "accept" ? (
              <>
                <Loader2 className="animate-spin" />
                Joining…
              </>
            ) : (
              "Accept invitation"
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void handleDecline(invitation)}
          >
            {busy === "decline" ? <Loader2 className="animate-spin" /> : null}
            Decline
          </Button>
        </motion.div>
      </motion.div>
    </Shell>
  )
}
