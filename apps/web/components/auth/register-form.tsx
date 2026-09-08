"use client"

import { useState, type FormEvent } from "react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { PasswordInput } from "@/components/auth/password-input"
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter"
import { VerifyEmailForm } from "@/components/auth/verify-email-form"
import { useSetupStatus } from "@/hooks/use-setup-status"
import { signUp } from "@/lib/auth-client"

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

type FieldErrors = { name?: string; email?: string; password?: string }

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

export function RegisterForm() {
  const router = useRouter()
  const needsSetup = useSetupStatus()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle")
  const [step, setStep] = useState<"details" | "verify">("details")

  const isBusy = status !== "idle"

  if (step === "verify") {
    return (
      <VerifyEmailForm
        email={email.trim().toLowerCase()}
        codeSent
        onVerified={() => router.push("/dashboard")}
        onBack={() => {
          setStep("details")
          setStatus("idle")
          setFormError(null)
        }}
        backLabel="Use a different email"
      />
    )
  }

  if (needsSetup === null) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (name.trim().length < 2) errors.name = "Enter your name."
    if (!EMAIL_PATTERN.test(email.trim()))
      errors.email = "Enter a valid email address."
    if (password.length < 8)
      errors.password = "Password must be at least 8 characters."
    return errors
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const errors = validate()
    setFieldErrors(errors)
    if (errors.name || errors.email || errors.password) return

    setFormError(null)
    setStatus("submitting")

    try {
      const result = await signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      })

      if (result.error) {
        setStatus("idle")
        setFormError(
          result.error.message ?? "Could not create the account. Please try again."
        )
        return
      }

      // With email verification on, sign-up creates the account but no session
      // (`token` is null) and emails a 6-digit code. Prove ownership first.
      if (!result.data?.token) {
        setStatus("idle")
        setStep("verify")
        return
      }

      setStatus("success")
      router.push("/dashboard")
    } catch {
      setStatus("idle")
      setFormError("Could not reach the server. Please try again.")
    }
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
          {needsSetup ? "Set up LLMPanel" : "Create your account"}
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {needsSetup
            ? "Create the administrator account for this installation."
            : "Deploy your first model in a couple of minutes."}
        </p>
      </motion.div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
        <AnimatePresence initial={false}>
          {formError ? (
            <motion.div
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
          ) : null}
        </AnimatePresence>

        <motion.div variants={item} className="flex flex-col gap-4">
          <Field data-invalid={Boolean(fieldErrors.name) || undefined}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={name}
              aria-invalid={Boolean(fieldErrors.name) || undefined}
              disabled={isBusy}
              onChange={(event) => {
                setName(event.target.value)
                if (fieldErrors.name) {
                  setFieldErrors((prev) => ({ ...prev, name: undefined }))
                }
              }}
            />
            <FieldError>{fieldErrors.name}</FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.email) || undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="ada@example.com"
              value={email}
              aria-invalid={Boolean(fieldErrors.email) || undefined}
              disabled={isBusy}
              onChange={(event) => {
                setEmail(event.target.value)
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: undefined }))
                }
              }}
            />
            <FieldError>{fieldErrors.email}</FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.password) || undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="new-password"
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
            <PasswordStrengthMeter password={password} />
            <FieldError>{fieldErrors.password}</FieldError>
            <FieldDescription className="text-pretty">
              Use 8+ characters with a mix of cases, numbers, and symbols.
            </FieldDescription>
          </Field>
        </motion.div>

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
                Creating account…
              </>
            ) : status === "success" ? (
              <>
                <Check />
                Account created
              </>
            ) : needsSetup ? (
              "Create admin account"
            ) : (
              "Create account"
            )}
          </Button>
        </motion.div>
      </form>

      <motion.p
        variants={item}
        className="text-center text-[13px] text-muted-foreground"
      >
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </motion.p>
    </motion.div>
  )
}
