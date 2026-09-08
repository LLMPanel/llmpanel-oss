"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, type Variants } from "motion/react"
import { AlertCircle, Check, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/auth/password-input"
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter"
import { emailOtp } from "@/lib/auth-client"

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

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/
const OTP_LENGTH = 6
// Matches the server's request-password-reset rate limit (3 per minute) so a
// user cannot click into a 429.
const RESEND_COOLDOWN_SECONDS = 60

type Step = "email" | "reset"

// The plugin's own messages ("Invalid OTP") are terse; say what to do next.
const RESET_ERROR_COPY: Record<string, string> = {
  INVALID_OTP: "That code is not valid. Check it and try again.",
  OTP_EXPIRED: "That code has expired. Request a new one below.",
  TOO_MANY_ATTEMPTS: "Too many incorrect attempts. Request a new code below.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "That password is too long.",
}
type FieldErrors = { email?: string; code?: string; password?: string; confirm?: string }

/**
 * Two steps: ask for the account's email, then take the 6-digit code from that
 * email together with the new password. The request step always reports
 * success — the server does not reveal whether an address has an account.
 */
export function ForgotPasswordForm() {
  const router = useRouter()

  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle")
  const [resendStatus, setResendStatus] = useState<"idle" | "sending">("idle")
  const [cooldown, setCooldown] = useState(0)

  const isBusy = status !== "idle"
  const normalizedEmail = email.trim().toLowerCase()

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const clearFieldError = (key: keyof FieldErrors) => {
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const requestCode = async (): Promise<boolean> => {
    const result = await emailOtp.requestPasswordReset({ email: normalizedEmail })
    if (result.error) {
      setFormError(result.error.message ?? "Could not send a reset code. Please try again.")
      return false
    }
    setCooldown(RESEND_COOLDOWN_SECONDS)
    return true
  }

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setFieldErrors({ email: "Enter the email address you signed up with." })
      return
    }

    setFieldErrors({})
    setFormError(null)
    setStatus("submitting")

    try {
      if (await requestCode()) setStep("reset")
    } catch {
      setFormError("Could not reach the server. Please try again.")
    } finally {
      setStatus("idle")
    }
  }

  const handleResend = async () => {
    setFormError(null)
    setNotice(null)
    setResendStatus("sending")
    try {
      if (await requestCode()) setNotice(`A new code is on its way to ${normalizedEmail}.`)
    } catch {
      setFormError("Could not reach the server. Please try again.")
    } finally {
      setResendStatus("idle")
    }
  }

  const validateReset = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (code.length !== OTP_LENGTH)
      errors.code = `Enter the ${OTP_LENGTH}-digit code from your email.`
    if (password.length < 8)
      errors.password = "Password must be at least 8 characters."
    if (confirm !== password) errors.confirm = "Passwords do not match."
    return errors
  }

  const handleResetSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const errors = validateReset()
    setFieldErrors(errors)
    if (errors.code || errors.password || errors.confirm) return

    setFormError(null)
    setNotice(null)
    setStatus("submitting")

    try {
      const result = await emailOtp.resetPassword({
        email: normalizedEmail,
        otp: code,
        password,
      })

      if (result.error) {
        setStatus("idle")
        setFormError(
          (result.error.code && RESET_ERROR_COPY[result.error.code]) ??
            result.error.message ??
            "That code is not valid. Request a new one and try again."
        )
        return
      }

      setStatus("success")
      router.push("/login?reset=1")
    } catch {
      setStatus("idle")
      setFormError("Could not reach the server. Please try again.")
    }
  }

  const backToEmail = () => {
    setStep("email")
    setCode("")
    setPassword("")
    setConfirm("")
    setFieldErrors({})
    setFormError(null)
    setNotice(null)
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
          {step === "reset" ? "Choose a new password" : "Forgot your password?"}
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {step === "reset" ? (
            <>
              If{" "}
              <span className="font-medium text-foreground">{normalizedEmail}</span>{" "}
              has an account, a {OTP_LENGTH}-digit code is on its way. Enter it
              with your new password.
            </>
          ) : (
            "Enter your account's email and we'll send you a code to reset it."
          )}
        </p>
      </motion.div>

      <form
        onSubmit={step === "reset" ? handleResetSubmit : handleEmailSubmit}
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
          ) : notice ? (
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

        {step === "reset" ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0 }}
            className="flex flex-col gap-4"
          >
            <Field data-invalid={Boolean(fieldErrors.code) || undefined}>
              <FieldLabel htmlFor="reset-code">Reset code</FieldLabel>
              <Input
                id="reset-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                maxLength={OTP_LENGTH}
                value={code}
                aria-invalid={Boolean(fieldErrors.code) || undefined}
                disabled={isBusy}
                className="text-center text-lg tracking-[0.4em] tabular-nums placeholder:tracking-[0.4em]"
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
                  clearFieldError("code")
                }}
              />
              <FieldDescription className="text-pretty">
                The code expires in 10 minutes. Check your spam folder if it has
                not arrived.
              </FieldDescription>
              <FieldError>{fieldErrors.code}</FieldError>
            </Field>

            <Field data-invalid={Boolean(fieldErrors.password) || undefined}>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                aria-invalid={Boolean(fieldErrors.password) || undefined}
                disabled={isBusy}
                onChange={(event) => {
                  setPassword(event.target.value)
                  clearFieldError("password")
                }}
              />
              <PasswordStrengthMeter password={password} />
              <FieldError>{fieldErrors.password}</FieldError>
            </Field>

            <Field data-invalid={Boolean(fieldErrors.confirm) || undefined}>
              <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                aria-invalid={Boolean(fieldErrors.confirm) || undefined}
                disabled={isBusy}
                onChange={(event) => {
                  setConfirm(event.target.value)
                  clearFieldError("confirm")
                }}
              />
              <FieldError>{fieldErrors.confirm}</FieldError>
            </Field>
          </motion.div>
        ) : (
          <motion.div variants={item}>
            <Field data-invalid={Boolean(fieldErrors.email) || undefined}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="alice@example.com"
                value={email}
                aria-invalid={Boolean(fieldErrors.email) || undefined}
                disabled={isBusy}
                onChange={(event) => {
                  setEmail(event.target.value)
                  clearFieldError("email")
                }}
              />
              <FieldDescription className="text-pretty">
                Username-only accounts have no email on file — ask an
                administrator to reset your password instead.
              </FieldDescription>
              <FieldError>{fieldErrors.email}</FieldError>
            </Field>
          </motion.div>
        )}

        <motion.div variants={item} className="flex flex-col gap-3">
          <Button
            type="submit"
            size="lg"
            disabled={isBusy}
            className="w-full active:scale-[0.96]"
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="animate-spin" />
                {step === "reset" ? "Updating password…" : "Sending code…"}
              </>
            ) : status === "success" ? (
              <>
                <Check />
                Password updated
              </>
            ) : step === "reset" ? (
              "Reset password"
            ) : (
              "Send reset code"
            )}
          </Button>

          {step === "reset" ? (
            <button
              type="button"
              disabled={isBusy || resendStatus === "sending" || cooldown > 0}
              onClick={() => void handleResend()}
              className="self-center text-[13px] font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              {resendStatus === "sending"
                ? "Sending…"
                : cooldown > 0
                  ? `Resend code in ${cooldown}s`
                  : "Resend code"}
            </button>
          ) : null}
        </motion.div>
      </form>

      <motion.p
        variants={item}
        className="text-center text-[13px] text-muted-foreground text-pretty"
      >
        {step === "reset" ? (
          <button
            type="button"
            onClick={backToEmail}
            disabled={isBusy}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Use a different email
          </button>
        ) : (
          <>
            Remembered it?{" "}
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </>
        )}
      </motion.p>
    </motion.div>
  )
}
