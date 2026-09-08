"use client"

import { FormEvent, useMemo, useState } from "react"
import { Loader2, Copy } from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { toast } from "sonner"
import { authClient, twoFactor, useSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

function hasError(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false
  }

  return Boolean("error" in result && (result as { error?: unknown }).error)
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

export default function SettingsPage() {
  const { data: session, isPending, refetch } = useSession()

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const [twoFactorPassword, setTwoFactorPassword] = useState("")
  const [disableTwoFactorPassword, setDisableTwoFactorPassword] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [totpUri, setTotpUri] = useState("")
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [isStarting2FA, setIsStarting2FA] = useState(false)
  const [isVerifying2FA, setIsVerifying2FA] = useState(false)
  const [isDisabling2FA, setIsDisabling2FA] = useState(false)

  const user = session?.user as
    | {
        name?: string | null
        email?: string | null
        twoFactorEnabled?: boolean
      }
    | undefined

  const twoFactorEnabled = Boolean(user?.twoFactorEnabled)
  const hasPendingEnrollment = totpUri.length > 0

  const passwordValidationMessage = useMemo(() => {
    if (!newPassword && !confirmPassword) {
      return null
    }

    if (newPassword.length > 0 && newPassword.length < 8) {
      return "Use at least 8 characters for your new password."
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return "New password and confirmation do not match."
    }

    return null
  }, [confirmPassword, newPassword])

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(successMessage)
    } catch {
      toast.error("Could not copy to clipboard")
    }
  }

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters")
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation must match")
      return
    }

    setIsChangingPassword(true)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions,
      })

      if (hasError(result)) {
        toast.error("Failed to update password. Check your current password and try again.")
        return
      }

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setRevokeOtherSessions(false)
      toast.success("Password updated")
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update password"))
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleStart2FA = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setIsStarting2FA(true)
    try {
      const result = await twoFactor.enable({ password: twoFactorPassword })

      if (hasError(result)) {
        toast.error("Failed to start 2FA setup. Check your password and try again.")
        return
      }

      const data = (result as { data?: { totpURI?: string; backupCodes?: string[] } }).data
      const nextTotpUri = data?.totpURI ?? ""
      const nextBackupCodes = data?.backupCodes ?? []

      if (!nextTotpUri) {
        toast.error("2FA setup response did not include a TOTP URI")
        return
      }

      setTotpUri(nextTotpUri)
      setBackupCodes(nextBackupCodes)
      setTotpCode("")
      toast.success("2FA setup created. Add it to your authenticator and verify code.")
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to start 2FA setup"))
    } finally {
      setIsStarting2FA(false)
    }
  }

  const handleVerify2FA = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!totpCode.trim()) {
      toast.error("Enter the 6-digit code from your authenticator app")
      return
    }

    setIsVerifying2FA(true)
    try {
      const result = await twoFactor.verifyTotp({ code: totpCode.trim() })

      if (hasError(result)) {
        toast.error("Invalid verification code")
        return
      }

      setTotpUri("")
      setBackupCodes([])
      setTotpCode("")
      setTwoFactorPassword("")
      await refetch()
      toast.success("Two-factor authentication enabled")
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to verify 2FA code"))
    } finally {
      setIsVerifying2FA(false)
    }
  }

  const handleDisable2FA = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setIsDisabling2FA(true)
    try {
      const result = await twoFactor.disable({ password: disableTwoFactorPassword })

      if (hasError(result)) {
        toast.error("Failed to disable 2FA. Check your password and try again.")
        return
      }

      setDisableTwoFactorPassword("")
      await refetch()
      toast.success("Two-factor authentication disabled")
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to disable 2FA"))
    } finally {
      setIsDisabling2FA(false)
    }
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const initials = (user?.name || user?.email || "?")
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <MotionConfig reducedMotion="user">
    <div className="max-w-3xl space-y-6">
      <header className="px-1 pt-1">
        <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Settings</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          Your account, password, and two‑factor authentication.
        </p>
      </header>

      {/* ── Account ── */}
      <Group title="Account" index={0}>
        <div className="flex items-center gap-4 px-5 py-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]">{user?.name || "Unnamed user"}</p>
            <p className="truncate text-[13px] text-muted-foreground">{user?.email || "No email"}</p>
          </div>
          <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", twoFactorEnabled ? "bg-success" : "bg-warning")} />
            {twoFactorEnabled ? "2FA on" : "2FA off"}
          </span>
        </div>
      </Group>

      {/* ── Password ── */}
      <Group title="Password" index={1}>
        <form onSubmit={(event) => void handleChangePassword(event)}>
          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            <FieldRow label="Current" htmlFor="current-password">
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                disabled={isChangingPassword}
                className={FIELD}
              />
            </FieldRow>
            <FieldRow label="New" htmlFor="new-password">
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                disabled={isChangingPassword}
                className={FIELD}
              />
            </FieldRow>
            <FieldRow label="Confirm" htmlFor="confirm-password">
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                disabled={isChangingPassword}
                className={FIELD}
              />
            </FieldRow>
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <label htmlFor="revoke-sessions" className="text-[14px]">Sign out other devices</label>
              <Switch
                id="revoke-sessions"
                checked={revokeOtherSessions}
                onCheckedChange={setRevokeOtherSessions}
                disabled={isChangingPassword}
              />
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <p className={cn("text-[12px]", passwordValidationMessage ? "text-destructive" : "text-muted-foreground")}>
                {passwordValidationMessage ?? "At least 8 characters."}
              </p>
              <Button
                type="submit"
                size="sm"
                className={PILL}
                disabled={
                  isChangingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  Boolean(passwordValidationMessage)
                }
              >
                {isChangingPassword && <Loader2 className="size-3.5 animate-spin" />}
                {isChangingPassword ? "Updating…" : "Update Password"}
              </Button>
            </div>
          </div>
        </form>
      </Group>

      {/* ── Two-factor ── */}
      <Group
        title="Two‑factor authentication"
        hint={twoFactorEnabled ? "An authenticator app is required to sign in." : "Add an authenticator app as a second sign‑in factor."}
        index={2}
      >
        {twoFactorEnabled ? (
          <form onSubmit={(event) => void handleDisable2FA(event)}>
            <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              <FieldRow label="Password" htmlFor="disable-2fa-password" hint="Confirm to turn 2FA off.">
                <input
                  id="disable-2fa-password"
                  type="password"
                  value={disableTwoFactorPassword}
                  onChange={(event) => setDisableTwoFactorPassword(event.target.value)}
                  required
                  disabled={isDisabling2FA}
                  className={FIELD}
                />
              </FieldRow>
              <div className="flex justify-end px-5 py-3">
                <Button type="submit" variant="secondary" size="sm" className={PILL} disabled={isDisabling2FA || !disableTwoFactorPassword}>
                  {isDisabling2FA && <Loader2 className="size-3.5 animate-spin" />}
                  {isDisabling2FA ? "Disabling…" : "Turn Off 2FA"}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {!hasPendingEnrollment && (
              <form onSubmit={(event) => void handleStart2FA(event)}>
                <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  <FieldRow label="Password" htmlFor="enable-2fa-password" hint="Confirm to generate a secret and backup codes.">
                    <input
                      id="enable-2fa-password"
                      type="password"
                      value={twoFactorPassword}
                      onChange={(event) => setTwoFactorPassword(event.target.value)}
                      required
                      disabled={isStarting2FA}
                      className={FIELD}
                    />
                  </FieldRow>
                  <div className="flex justify-end px-5 py-3">
                    <Button type="submit" size="sm" className={PILL} disabled={isStarting2FA || !twoFactorPassword}>
                      {isStarting2FA && <Loader2 className="size-3.5 animate-spin" />}
                      {isStarting2FA ? "Preparing…" : "Set Up 2FA"}
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {hasPendingEnrollment && (
              <>
                {/* Step 1 */}
                <div className="space-y-2 px-5 py-4">
                  <p className="text-[14px] font-medium">1. Add to your authenticator</p>
                  <p className="text-[12px] leading-[1.45] text-muted-foreground">
                    Paste this URI into your authenticator app if you can&apos;t scan a QR code.
                  </p>
                  <div className="flex items-center gap-2 rounded-xl bg-muted py-1.5 pl-3.5 pr-1.5">
                    <code className="flex-1 truncate font-mono text-[12px]">{totpUri}</code>
                    <button
                      type="button"
                      aria-label="Copy URI"
                      onClick={() => void copyToClipboard(totpUri, "TOTP URI copied")}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[transform,background-color,color] hover:bg-background hover:text-foreground active:scale-90"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </div>

                {backupCodes.length > 0 && (
                  <div className="space-y-2 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[14px] font-medium">Backup codes</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 gap-1 rounded-full px-2.5 text-[12px] transition-transform active:scale-[0.95]"
                        onClick={() => void copyToClipboard(backupCodes.join("\n"), "Backup codes copied")}
                      >
                        <Copy className="size-3.5" />
                        Copy all
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-muted px-3.5 py-3 font-mono text-[12px] leading-6 sm:grid-cols-3">
                      {backupCodes.map((code) => (
                        <div key={code}>{code}</div>
                      ))}
                    </div>
                    <p className="text-[12px] text-muted-foreground">Keep these somewhere safe — they&apos;re only shown once.</p>
                  </div>
                )}

                {/* Step 2 */}
                <form onSubmit={(event) => void handleVerify2FA(event)}>
                  <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                    <div className="px-5 pb-1 pt-4">
                      <p className="text-[14px] font-medium">2. Enter the 6‑digit code</p>
                    </div>
                    <FieldRow label="Code" htmlFor="totp-code">
                      <input
                        id="totp-code"
                        inputMode="numeric"
                        placeholder="123456"
                        value={totpCode}
                        onChange={(event) => setTotpCode(event.target.value)}
                        disabled={isVerifying2FA}
                        required
                        className={cn(FIELD, "font-mono tracking-[0.2em]")}
                      />
                    </FieldRow>
                    <div className="flex justify-end px-5 py-3">
                      <Button type="submit" size="sm" className={PILL} disabled={isVerifying2FA || !totpCode.trim()}>
                        {isVerifying2FA && <Loader2 className="size-3.5 animate-spin" />}
                        {isVerifying2FA ? "Verifying…" : "Verify & Enable"}
                      </Button>
                    </div>
                  </div>
                </form>
              </>
            )}
          </div>
        )}
      </Group>
    </div>
    </MotionConfig>
  )
}

// ── Settings.app primitives ──────────────────────────────────────────────────

const PILL = "h-8 gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-transform active:scale-[0.96]"
const FIELD =
  "h-8 w-full max-w-xs rounded-[9px] border-0 bg-muted px-3 text-right text-[14px] outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"

/** Label left, control right — the Settings row. */
function FieldRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-2.5">
      <label htmlFor={htmlFor} className="shrink-0">
        <span className="block text-[14px]">{label}</span>
        {hint && <span className="block text-[12px] text-muted-foreground">{hint}</span>}
      </label>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  )
}

function Group({
  title,
  hint,
  index,
  children,
}: {
  title: string
  hint?: string
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
      <div className="px-3">
        <h2 className="text-[12px] font-medium text-muted-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-muted-foreground/70">{hint}</p>}
      </div>
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
        {children}
      </div>
    </motion.section>
  )
}
