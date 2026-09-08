const VAST_API_BASE = "https://console.vast.ai/api/v0";

// ── Vast.ai 2FA REST API response shapes ──────────────────────────────

/** A single configured 2FA method as returned by `GET /tfa/status/`. */
export interface VastTfaMethod {
  id: number;
  user_id: number;
  method: string; // "totp" | "sms" | "email"
  label: string | null;
  phone_number: string | null;
  is_primary: boolean;
  fail_count: number;
  locked_until: string | null;
  created_at: string;
  last_used: string | null;
}

export interface VastTfaStatus {
  success: boolean;
  tfa_enabled: boolean;
  methods: VastTfaMethod[];
  backup_codes_remaining: number;
  /** True once a Step-2 authorization window has been granted (30 min). */
  new_method_authorized: boolean;
}

export interface VastTotpSetup {
  /** Base32 TOTP secret to store / show as text. */
  secret: string;
  /** `otpauth://` URI to render as a QR code. */
  provisioning_uri: string;
}

export interface VastAuthorizeStart {
  success: boolean;
  /** Short-lived challenge token (`tfa_secret`) to thread into the verify step. */
  secret: string;
}

export interface VastAuthorizeVerify {
  success: boolean;
  msg: string;
}

export interface VastConfirmTotp {
  success: boolean;
  msg: string;
  /** Present only when activating the FIRST 2FA method. Format "XXXX-XXXX-XXXX". */
  backup_codes?: string[];
}

export interface VastTfaVerify {
  /** The authenticated user object (shape varies; kept permissive by design). */
  user: Record<string, unknown>;
  /** Returned in the CLI/bearer flow for subsequent authenticated requests. */
  session_key?: string;
  backup_codes_remaining?: number;
  legacy_tfa_user?: boolean;
}

export interface VastRemoveMethod {
  msg: string;
  remaining_methods: number;
}

export interface VastRegenBackupCodes {
  msg: string;
  /** Fresh set of 10 codes. Format "XXXX-XXXX-XXXX". */
  backup_codes: string[];
}

/** Shape Vast.ai returns on a failed request. */
interface VastErrorBody {
  error?: string;
  msg?: string;
}

/**
 * Thrown for any non-2xx response from the Vast.ai 2FA API. Exposes the
 * machine-readable `code` (e.g. "2fa_verification_failed", "tfa_locked",
 * "authorization_required") so callers can branch on it.
 */
export class VastTfaError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = "VastTfaError";
    this.status = status;
    this.code = code;
  }
}

// ── Request parameter shapes ──────────────────────────────────────────

export interface ConfirmTotpParams {
  /** 6-digit code from the authenticator app. */
  code: string;
  /** The `secret` returned from `setupTotp()`. */
  secret: string;
  /** Optional human label (max 30 chars). */
  label?: string;
}

export interface AuthorizeVerifyParams {
  /** 6-digit code from an existing method. */
  code: string;
  /** The `secret` returned from `authorizeNewMethodStart()`. */
  secret: string;
}

export interface AuthorizeStartParams {
  /** Existing method type to verify with, e.g. "totp". */
  tfaMethod?: string;
  /** Disambiguates when the user has multiple methods of the same type. */
  tfaMethodId?: number;
  /** Alternatively authorize with a backup code (skips the send/verify sub-steps). */
  backupCode?: string;
}

export interface VerifyParams {
  /** 6-digit TOTP code. Omit when using `backupCode`. */
  code?: string;
  /** Challenge token, if the flow produced one. */
  secret?: string;
  /** Required when the user has multiple methods of the same type. */
  tfaMethodId?: number;
  /** Recovery code, format "XXXX-XXXX-XXXX". */
  backupCode?: string;
}

export interface RemoveMethodParams {
  /** ID of the method to remove (from `getStatus()`). */
  targetId: number;
  code?: string;
  backupCode?: string;
  secret?: string;
  tfaMethodId?: number;
}

export interface RegenBackupCodesParams {
  code?: string;
  backupCode?: string;
  secret?: string;
  tfaMethodId?: number;
}

// ── Client ────────────────────────────────────────────────────────────

/**
 * Typed client for Vast.ai's TOTP-based two-factor authentication management
 * endpoints. Authenticates with a Vast.ai API key (Bearer token) — the same
 * key used by {@link VastAIProvider}.
 *
 * Scope: TOTP + backup codes only. The password/`session_key` login flow and
 * SMS/email delivery are intentionally not implemented.
 *
 * Typical first-time setup:
 *   1. `setupTotp()` → show `provisioning_uri` as a QR code.
 *   2. `confirmTotp({ code, secret })` → activates; returns `backup_codes`.
 *
 * Adding a second TOTP method when 2FA is already enabled:
 *   1. `authorizeNewMethodStart({ tfaMethod: "totp" })` → `secret`.
 *   2. `authorizeNewMethodVerify({ code, secret })` → opens 30-min window.
 *   3. `setupTotp()` then `confirmTotp({ code, secret })`.
 */
export class VastAITwoFactorClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${VAST_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      let code: string | undefined;
      let msg = text;
      try {
        const parsed = JSON.parse(text) as VastErrorBody;
        code = parsed.error;
        msg = parsed.msg ?? parsed.error ?? text;
      } catch {
        // Non-JSON error body — fall back to the raw text.
      }
      throw new VastTfaError(
        res.status,
        code,
        `Vast.ai 2FA API error ${res.status}${code ? ` (${code})` : ""}: ${msg}`,
      );
    }

    return res.json() as Promise<T>;
  }

  /** Current 2FA configuration for the authenticated account. */
  async getStatus(): Promise<VastTfaStatus> {
    return this.request<VastTfaStatus>("GET", "/tfa/status/");
  }

  /**
   * Generate a new TOTP secret + provisioning URI. Does not activate anything;
   * call {@link confirmTotp} with a code to activate.
   */
  async setupTotp(): Promise<VastTotpSetup> {
    return this.request<VastTotpSetup>("POST", "/tfa/totp-setup/");
  }

  /**
   * Step 1 of adding a method when 2FA is ALREADY enabled. Verify with an
   * existing method's code (via the returned `secret`) or a backup code.
   */
  async authorizeNewMethodStart(
    params: AuthorizeStartParams = {},
  ): Promise<VastAuthorizeStart> {
    return this.request<VastAuthorizeStart>(
      "POST",
      "/tfa/authorize-new-method/",
      {
        ...(params.tfaMethod !== undefined
          ? { tfa_method: params.tfaMethod }
          : {}),
        ...(params.tfaMethodId !== undefined
          ? { tfa_method_id: params.tfaMethodId }
          : {}),
        ...(params.backupCode !== undefined
          ? { backup_code: params.backupCode }
          : {}),
      },
    );
  }

  /** Step 2 of adding a method — grants a 30-minute add-method window. */
  async authorizeNewMethodVerify(
    params: AuthorizeVerifyParams,
  ): Promise<VastAuthorizeVerify> {
    return this.request<VastAuthorizeVerify>(
      "PUT",
      "/tfa/authorize-new-method/",
      { code: params.code, secret: params.secret },
    );
  }

  /**
   * Activate a TOTP method with a verification code. On the FIRST method the
   * response includes `backup_codes` — surface them to the user exactly once.
   */
  async confirmTotp(params: ConfirmTotpParams): Promise<VastConfirmTotp> {
    return this.request<VastConfirmTotp>("POST", "/tfa/confirm-new/", {
      tfa_method: "totp",
      code: params.code,
      secret: params.secret,
      ...(params.label !== undefined ? { label: params.label } : {}),
    });
  }

  /** Verify a TOTP or backup code (bearer/CLI flow). */
  async verify(params: VerifyParams): Promise<VastTfaVerify> {
    return this.request<VastTfaVerify>("POST", "/tfa/", {
      tfa_method: "totp",
      ...(params.code !== undefined ? { code: params.code } : {}),
      ...(params.secret !== undefined ? { secret: params.secret } : {}),
      ...(params.tfaMethodId !== undefined
        ? { tfa_method_id: params.tfaMethodId }
        : {}),
      ...(params.backupCode !== undefined
        ? { backup_code: params.backupCode }
        : {}),
    });
  }

  /** Replace all backup codes with a fresh set of 10. Requires re-verification. */
  async regenerateBackupCodes(
    params: RegenBackupCodesParams = {},
  ): Promise<VastRegenBackupCodes> {
    return this.request<VastRegenBackupCodes>(
      "PUT",
      "/tfa/regen-backup-codes/",
      {
        tfa_method: "totp",
        ...(params.code !== undefined ? { code: params.code } : {}),
        ...(params.backupCode !== undefined
          ? { backup_code: params.backupCode }
          : {}),
        ...(params.secret !== undefined ? { secret: params.secret } : {}),
        ...(params.tfaMethodId !== undefined
          ? { tfa_method_id: params.tfaMethodId }
          : {}),
      },
    );
  }

  /** Remove a configured 2FA method. Requires re-verification. */
  async removeMethod(params: RemoveMethodParams): Promise<VastRemoveMethod> {
    return this.request<VastRemoveMethod>("DELETE", "/tfa/", {
      tfa_method: "totp",
      target_id: params.targetId,
      ...(params.code !== undefined ? { code: params.code } : {}),
      ...(params.backupCode !== undefined
        ? { backup_code: params.backupCode }
        : {}),
      ...(params.secret !== undefined ? { secret: params.secret } : {}),
      ...(params.tfaMethodId !== undefined
        ? { tfa_method_id: params.tfaMethodId }
        : {}),
    });
  }
}
