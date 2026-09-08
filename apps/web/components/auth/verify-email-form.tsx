"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { AlertCircle, Check, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { emailOtp } from "@/lib/auth-client"

const OTP_LENGTH = 6
// Matches the server's send-verification-otp rate limit (3 per minute) so a
// user cannot click into a 429.
const RESEND_COOLDOWN_SECONDS = 60

interface VerifyEmailFormProps {
  email: string
  /** Whether a code was already sent (sign-up does; sign-in must ask first). */
  codeSent: boolean
  onVerified: () => void
  onBack: () => void
  backLabel?: string
}

/**
 * The "enter the 6-digit code we emailed you" step shared by sign-up and by
 * sign-in for accounts that never finished verifying. Verifying signs the user
 * in (autoSignInAfterVerification), so `onVerified` can navigate straight away.
 */
export function VerifyEmailForm({
  email,
  codeSent,
  onVerified,
  onBack,
  backLabel = "Back",
}: VerifyEmailFormProps) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle")
  const [resendStatus, setResendStatus] = useState<"idle" | "sending">("idle")
  const [cooldown, setCooldown] = useState(codeSent ? RESEND_COOLDOWN_SECONDS : 0)
  const [sent, setSent] = useState(codeSent)

  const isBusy = status !== "idle"

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const sendCode = async () => {
    setError(null)
    setNotice(null)
    setResendStatus("sending")
    try {
      const result = await emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      })
      if (result.error) {
        setError(result.error.message ?? "Could not send a new code. Please try again.")
        return
      }
      setSent(true)
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setNotice(`A new code is on its way to ${email}.`)
    } catch {
      setError("Could not reach the server. Please try again.")
    } finally {
      setResendStatus("idle")
    }
  }

  // Sign-in lands here without a code in flight — request one immediately.
  // The ref keeps React's dev-only double mount from emailing two codes.
  const autoSendStarted = useRef(false)
  useEffect(() => {
    if (codeSent || autoSendStarted.current) return
    autoSendStarted.current = true
    void sendCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const otp = code.replace(/\D/g, "")
    if (otp.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`)
      return
    }

    setError(null)
    setNotice(null)
    setStatus("submitting")

    try {
      const result = await emailOtp.verifyEmail({ email, otp })
      if (result.error) {
        setStatus("idle")
        setError(result.error.message ?? "That code is not valid. Please try again.")
        return
      }
      setStatus("success")
      onVerified()
    } catch {
      setStatus("idle")
      setError("Could not reach the server. Please try again.")
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.5, bounce: 0 }}
      className="flex flex-col gap-8"
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Check your email
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">
          We sent a {OTP_LENGTH}-digit code to{" "}
          <span className="font-medium text-foreground">{email}</span>. Enter it
          below to confirm this address is yours.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
        <AnimatePresence initial={false}>
          {error ? (
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
                <p className="text-pretty">{error}</p>
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

        <Field>
          <FieldLabel htmlFor="email-otp">Verification code</FieldLabel>
          <Input
            id="email-otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            maxLength={OTP_LENGTH}
            value={code}
            disabled={isBusy}
            className="text-center text-lg tracking-[0.4em] tabular-nums placeholder:tracking-[0.4em]"
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
              if (error) setError(null)
            }}
          />
          <FieldDescription className="text-pretty">
            The code expires in 10 minutes. Check your spam folder if it has not
            arrived.
          </FieldDescription>
        </Field>

        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            size="lg"
            disabled={isBusy || code.length !== OTP_LENGTH}
            className="w-full active:scale-[0.96]"
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="animate-spin" />
                Verifying…
              </>
            ) : status === "success" ? (
              <>
                <Check />
                Verified
              </>
            ) : (
              "Verify email"
            )}
          </Button>

          <button
            type="button"
            disabled={isBusy || resendStatus === "sending" || cooldown > 0}
            onClick={() => void sendCode()}
            className="self-center text-[13px] font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {resendStatus === "sending"
              ? "Sending…"
              : cooldown > 0
                ? `Resend code in ${cooldown}s`
                : sent
                  ? "Resend code"
                  : "Send code"}
          </button>
        </div>
      </form>

      <p className="text-center text-[13px] text-muted-foreground">
        <button
          type="button"
          onClick={onBack}
          disabled={isBusy}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {backLabel}
        </button>
      </p>
    </motion.div>
  )
}
