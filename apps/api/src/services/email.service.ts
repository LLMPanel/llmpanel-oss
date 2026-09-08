// apps/api/src/services/email.service.ts
//
// Transactional email through one of two zero-dependency REST providers:
//
//   resend      https://resend.com          RESEND_API_KEY
//   cloudflare  Cloudflare Email Sending    CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_EMAIL_API_TOKEN
//
// EMAIL_PROVIDER picks one explicitly; unset means "whichever is configured",
// Resend first. Both are called with plain fetch — one request, no SDK.
//
// Behavior by environment:
//   development, no provider → email is printed to the console, never sent
//   any env + provider       → sent through that provider
//   production, no provider  → throws, so callers surface a real error instead
//                              of silently dropping OTPs / reset links
import { env } from "../env"

interface SendEmailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

export type EmailProvider = "resend" | "cloudflare"

const hasResend = (): boolean => Boolean(env.RESEND_API_KEY)
const hasCloudflare = (): boolean =>
  Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_EMAIL_API_TOKEN)

/** The provider that will deliver mail, or null when none is usable. */
export function resolveEmailProvider(): EmailProvider | null {
  if (env.EMAIL_PROVIDER === "resend") return hasResend() ? "resend" : null
  if (env.EMAIL_PROVIDER === "cloudflare") return hasCloudflare() ? "cloudflare" : null
  if (hasResend()) return "resend"
  if (hasCloudflare()) return "cloudflare"
  return null
}

export const isEmailConfigured = (): boolean => resolveEmailProvider() !== null

/** Splits `Name <addr@host>` (or a bare address) into its parts. */
function parseFromAddress(from: string): { name?: string; address: string } {
  const match = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(from)
  if (match) {
    const name = match[1]?.trim()
    return { ...(name ? { name } : {}), address: match[2]!.trim() }
  }
  return { address: from.trim() }
}

async function sendViaResend({ to, subject, text, html }: SendEmailOptions): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      text,
      ...(html ? { html } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }
}

interface CloudflareSendResponse {
  success?: boolean
  errors?: Array<{ code?: number; message?: string }>
  result?: {
    delivered?: string[]
    permanent_bounces?: string[]
    queued?: string[]
  }
}

async function sendViaCloudflare({ to, subject, text, html }: SendEmailOptions): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_EMAIL_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // REST API shape: `from.address` (not `email`), snake_case elsewhere.
      from: parseFromAddress(env.EMAIL_FROM),
      to: [to],
      subject,
      text,
      ...(html ? { html } : {}),
    }),
  })

  const body = (await res.json().catch(() => null)) as CloudflareSendResponse | null

  if (!res.ok || body?.success === false) {
    const detail =
      body?.errors?.map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ") ||
      `HTTP ${res.status}`
    throw new Error(`Cloudflare Email API error: ${detail}`)
  }

  if (body?.result?.permanent_bounces?.includes(to)) {
    throw new Error(`Cloudflare Email API: ${to} permanently bounced`)
  }
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const provider = resolveEmailProvider()

  if (!provider) {
    if (env.NODE_ENV === "development") {
      console.log(
        `\n[DEV EMAIL] to: ${options.to}\n  subject: ${options.subject}\n  ${options.text}\n`
      )
      return
    }
    throw new Error(
      env.EMAIL_PROVIDER
        ? `EMAIL_PROVIDER=${env.EMAIL_PROVIDER} but its credentials are missing — cannot send email.`
        : "No email provider configured — set RESEND_API_KEY, or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_EMAIL_API_TOKEN, in the API environment."
    )
  }

  if (provider === "resend") await sendViaResend(options)
  else await sendViaCloudflare(options)
}

// ── Templates ────────────────────────────────────────────────────────────────

/** A big, copyable code block; plain-text fallback is always sent alongside. */
function otpHtml(heading: string, otp: string, footer: string): string {
  const digits = otp.split("").join(" ")
  return `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6366f1">LLMPanel</p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${heading}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#475569">Enter this code to continue. It expires in 10 minutes.</p>
    <p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:.3em;text-align:center;padding:16px;background:#f1f5f9;border-radius:8px">${digits}</p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8">${footer}</p>
  </div>
</body></html>`
}

/** Two-factor sign-in code (twoFactor plugin). */
export async function sendOTPEmail(to: string, otp: string): Promise<void> {
  await sendEmail({
    to,
    subject: `${otp} is your LLMPanel verification code`,
    text: `Your LLMPanel verification code is: ${otp}\n\nThis code expires shortly. If you did not request it, you can ignore this email.`,
    html: otpHtml(
      "Your sign-in code",
      otp,
      "If you did not request this code, you can safely ignore this email."
    ),
  })
}

/** Sign-up email-ownership code (emailOTP plugin). */
export async function sendSignupOTPEmail(to: string, otp: string): Promise<void> {
  await sendEmail({
    to,
    subject: `${otp} is your LLMPanel sign-up code`,
    text: `Welcome to LLMPanel!\n\nYour sign-up verification code is: ${otp}\n\nEnter it on the sign-up page to confirm this email address. The code expires in 10 minutes.\n\nIf you did not create an account, you can ignore this email.`,
    html: otpHtml(
      "Confirm your email address",
      otp,
      "If you did not create an LLMPanel account, you can safely ignore this email."
    ),
  })
}

/** Password-reset code (emailOTP plugin, forget-password flow). */
export async function sendPasswordResetOTPEmail(to: string, otp: string): Promise<void> {
  await sendEmail({
    to,
    subject: `${otp} is your LLMPanel password reset code`,
    text: `A password reset was requested for your LLMPanel account.\n\nYour reset code is: ${otp}\n\nIt expires in 10 minutes. If you did not request this, you can ignore this email — your password is unchanged.`,
    html: otpHtml(
      "Reset your password",
      otp,
      "If you did not request a reset, ignore this email — your password is unchanged."
    ),
  })
}

export async function sendVerificationEmail(to: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Verify your LLMPanel email address",
    text: `Confirm your email address to finish setting up your LLMPanel account:\n\n${url}\n\nIf you did not create an account, you can ignore this email.`,
  })
}

export async function sendInvitationEmail(
  to: string,
  inviterName: string,
  workspaceName: string,
  inviteLink: string
): Promise<void> {
  await sendEmail({
    to,
    subject: `${inviterName} invited you to ${workspaceName} on LLMPanel`,
    text: `${inviterName} has invited you to join the "${workspaceName}" workspace on LLMPanel.\n\nAccept the invitation here:\n\n${inviteLink}\n\nIf you weren't expecting this, you can ignore this email.`,
  })
}

export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your LLMPanel password",
    text: `A password reset was requested for your LLMPanel account. Reset it here:\n\n${url}\n\nIf you did not request this, you can ignore this email — your password is unchanged.`,
  })
}
