"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, type Variants } from "motion/react"
import { AlertCircle, Check, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/auth/password-input"
import { VerifyEmailForm } from "@/components/auth/verify-email-form"
import { useSetupStatus } from "@/hooks/use-setup-status"
import { signIn, twoFactor } from "@/lib/auth-client"
import { DEFAULT_REDIRECT } from "@/lib/safe-redirect"

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

type FieldErrors = { identifier?: string; password?: string }

export function LoginForm({
  redirectTo = DEFAULT_REDIRECT,
  passwordReset = false,
}: {
  redirectTo?: string
  /** Arrived from a successful password reset — show a one-off confirmation. */
  passwordReset?: boolean
}) {
  const router = useRouter()
  const needsSetup = useSetupStatus()

  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle")
  const [step, setStep] = useState<"credentials" | "totp" | "verify-email">("credentials")
  const [totpCode, setTotpCode] = useState("")
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [unverifiedEmail, setUnverifiedEmail] = useState("")
  const [notice, setNotice] = useState<string | null>(
    passwordReset ? "Your password has been updated. Sign in with your new password." : null
  )

  const isBusy = status !== "idle"

  // An account that never entered its sign-up code cannot sign in until it
  // does. Re-send the code and finish verification here instead of bouncing
  // the user back to the register page.
  if (step === "verify-email") {
    return (
      <VerifyEmailForm
        email={unverifiedEmail}
        codeSent={false}
        onVerified={() => router.push(redirectTo)}
        onBack={() => {
          setStep("credentials")
          setUnverifiedEmail("")
          setFormError(null)
          setStatus("idle")
        }}
        backLabel="Back to sign in"
      />
    )
  }

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (!identifier.trim()) errors.identifier = "Enter your email or username."
    if (!password) errors.password = "Enter your password."
    return errors
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const errors = validate()
    setFieldErrors(errors)
    if (errors.identifier || errors.password) return

    setFormError(null)
    setNotice(null)
    setStatus("submitting")

    try {
      // Admin-created accounts have no real email — they sign in with just a
      // username, which maps to a synthetic `<username>@users.local` address.
      const email = identifier.includes("@")
        ? identifier.trim()
        : `${identifier.trim().toLowerCase()}@users.local`

      const result = await signIn.email({ email, password })

      if (result.error?.code === "EMAIL_NOT_VERIFIED") {
        setStatus("idle")
        setUnverifiedEmail(email.toLowerCase())
        setStep("verify-email")
        return
      }

      if (result.error) {
        setStatus("idle")
        setFormError(
          result.error.message ??
            "Invalid credentials. Check your email or username and password."
        )
        return
      }

      // Accounts with 2FA enabled don't get a session yet — better-auth asks
      // for a TOTP code first.
      if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
        setStatus("idle")
        setStep("totp")
        return
      }

      setStatus("success")
      router.push(redirectTo)
    } catch {
      setStatus("idle")
      setFormError("Could not reach the server. Please try again.")
    }
  }

  const handleTotpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const code = totpCode.trim().replace(/\s+/g, "")
    if (!code) {
      setFormError(
        useBackupCode ? "Enter a backup code." : "Enter the 6-digit code from your authenticator app."
      )
      return
    }

    setFormError(null)
    setStatus("submitting")

    try {
      const result = useBackupCode
        ? await twoFactor.verifyBackupCode({ code })
        : await twoFactor.verifyTotp({ code })

      if (result.error) {
        setStatus("idle")
        setFormError(
          result.error.message ??
            (useBackupCode ? "Invalid backup code." : "Invalid code. Please try again.")
        )
        return
      }

      setStatus("success")
      router.push(redirectTo)
    } catch {
      setStatus("idle")
      setFormError("Could not reach the server. Please try again.")
    }
  }

  const backToCredentials = () => {
    setStep("credentials")
    setTotpCode("")
    setUseBackupCode(false)
    setFormError(null)
    setStatus("idle")
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-8"
    >
      <motion.div variants={item} className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {step === "totp" ? "Two-factor authentication" : "Welcome back"}
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {step === "totp"
            ? useBackupCode
              ? "Enter one of your backup codes."
              : "Enter the 6-digit code from your authenticator app."
            : "Sign in to your LLMPanel dashboard."}
        </p>
      </motion.div>

      <form
        onSubmit={step === "totp" ? handleTotpSubmit : handleSubmit}
        noValidate
        className="flex flex-col gap-8"
      >
        <AnimatePresence initial={false}>
          {formError ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            >
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p className="text-pretty">{formError}</p>
              </div>
            </motion.div>
          ) : notice && step === "credentials" ? (
            <motion.div
              key="notice"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            >
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
              >
                <Check className="mt-0.5 size-4 shrink-0" />
                <p className="text-pretty">{notice}</p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {step === "totp" ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0 }}
            className="flex flex-col gap-4"
          >
            <Field>
              <FieldLabel htmlFor="totp-code">
                {useBackupCode ? "Backup code" : "Verification code"}
              </FieldLabel>
              <Input
                id="totp-code"
                type="text"
                inputMode={useBackupCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoFocus
                placeholder={useBackupCode ? "xxxxx-xxxxx" : "123456"}
                maxLength={useBackupCode ? undefined : 6}
                value={totpCode}
                disabled={isBusy}
                onChange={(event) => setTotpCode(event.target.value)}
              />
            </Field>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setUseBackupCode((prev) => !prev)
                setTotpCode("")
                setFormError(null)
              }}
              className="self-start text-[13px] font-medium text-primary underline-offset-4 hover:underline"
            >
              {useBackupCode
                ? "Use an authenticator code instead"
                : "Use a backup code instead"}
            </button>
          </motion.div>
        ) : (
        <motion.div variants={item} className="flex flex-col gap-4">
          <Field data-invalid={Boolean(fieldErrors.identifier) || undefined}>
            <FieldLabel htmlFor="identifier">Email or username</FieldLabel>
            <Input
              id="identifier"
              type="text"
              autoComplete="username"
              placeholder="alice or alice@example.com"
              value={identifier}
              aria-invalid={Boolean(fieldErrors.identifier) || undefined}
              disabled={isBusy}
              onChange={(event) => {
                setIdentifier(event.target.value)
                if (fieldErrors.identifier) {
                  setFieldErrors((prev) => ({ ...prev, identifier: undefined }))
                }
              }}
            />
            <FieldError>{fieldErrors.identifier}</FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.password) || undefined}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                href="/forgot-password"
                tabIndex={isBusy ? -1 : undefined}
                className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              aria-invalid={Boolean(fieldErrors.password) || undefined}
              disabled={isBusy}
              onChange={(event) => {
                setPassword(event.target.value)
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }))
                }
              }}
            />
            <FieldError>{fieldErrors.password}</FieldError>
          </Field>
        </motion.div>
        )}

        <motion.div variants={item}>
          <Button
            type="submit"
            size="lg"
            disabled={isBusy}
            className="w-full active:scale-[0.96]"
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="animate-spin" />
                {step === "totp" ? "Verifying…" : "Signing in…"}
              </>
            ) : status === "success" ? (
              <>
                <Check />
                Signed in
              </>
            ) : step === "totp" ? (
              "Verify"
            ) : (
              "Sign in"
            )}
          </Button>
        </motion.div>
      </form>

      <motion.p
        variants={item}
        className="text-center text-[13px] text-muted-foreground text-pretty"
      >
        {step === "totp" ? (
          <button
            type="button"
            onClick={backToCredentials}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </button>
        ) : (
          <>
            {needsSetup ? "New installation?" : "Don't have an account?"}{" "}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {needsSetup ? "Create the admin account" : "Create one"}
            </Link>
          </>
        )}
      </motion.p>
    </motion.div>
  )
}
