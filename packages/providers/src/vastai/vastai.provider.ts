import { authenticator } from "otplib";
import { vllmSpeculativeArg, sglangSpeculativeArg } from "../shared/speculative";
import type {
  IGPUProvider,
  DeployModelInput,
  DeploymentInfo,
  GPUMetrics,
  MetricsCapabilities,
} from "../types";

const VAST_API_BASE = "https://console.vast.ai/api/v0";

// ── Vast.ai REST API response shapes ─────────────────────────────────

interface VastOffer {
  id: number;
  gpu_name: string;
  gpu_ram: number; // VRAM in MB
  dph_total: number; // cost per hour USD
  rentable: boolean;
  num_gpus: number;
}

interface VastInstance {
  id: number;
  actual_status: string | null; // "created" | "loading" | "running" | "stopped" | "exited"
  cur_state: string;
  public_ipaddr: string | null;
  ports: Record<string, Array<{ HostIp: string; HostPort: string }>> | null;
  dph_total: number;
  gpu_name: string;
  status_msg: string | null;
}

interface VastOffersResponse {
  offers: VastOffer[];
}

interface VastCreateResponse {
  success: boolean;
  new_contract: number;
}

interface VastInstancesResponse {
  instances: VastInstance[];
}

interface VastLogResponse {
  success: boolean;
  result_url: string;
}

/** Response from `POST /tfa/` when authenticating with an API key (CLI flow). */
interface VastTfaVerifyResponse {
  session_key?: string;
  user?: Record<string, unknown>;
}

/** Detects Vast.ai's "requires 2FA" authorization error in a 401 body. */
function is2faError(text: string): boolean {
  return /two[\s-]?factor|\b2fa\b/i.test(text);
}

// ── Provider ──────────────────────────────────────────────────────────

export class VastAIProvider implements IGPUProvider {
  private readonly apiKey: string;
  /** Optional Vast.ai TOTP (base32) secret used to mint a 2FA session key. */
  private readonly totpSecret: string | undefined;
  /** Cached 2FA session key, minted lazily on the first 2FA-gated 401. */
  private sessionKey: string | null = null;

  constructor(apiKey: string, totpSecret?: string) {
    this.apiKey = apiKey;
    this.totpSecret = totpSecret?.trim() ? totpSecret.trim() : undefined;
  }

  /**
   * Exchange the API key + a freshly generated TOTP code for a `session_key`
   * via `POST /tfa/`. The session key carries the "logged in via 2FA" privilege
   * that plain API keys lack for write actions once 2FA is enabled.
   */
  private async mintSessionKey(): Promise<string> {
    if (!this.totpSecret) {
      throw new Error(
        "Vast.ai requires a Two-Factor Authentication session for this action, " +
          "but no TOTP secret is configured for this provider connection. Add your " +
          "Vast.ai 2FA (TOTP) secret to the connection so LLMPanel can authenticate.",
      );
    }

    const code = authenticator.generate(this.totpSecret);
    const res = await fetch(`${VAST_API_BASE}/tfa/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ tfa_method: "totp", code }),
    });

    const text = await res.text();
    let parsed: VastTfaVerifyResponse | undefined;
    try {
      parsed = JSON.parse(text) as VastTfaVerifyResponse;
    } catch {
      // non-JSON body — handled by the guard below
    }

    if (!res.ok || !parsed?.session_key) {
      throw new Error(
        "Vast.ai 2FA session exchange failed — could not obtain a session key " +
          "from the API key + TOTP code. Vast.ai may require a full " +
          "username/password login for this action, or the TOTP secret / system " +
          `clock may be wrong. (Vast.ai said: ${text})`,
      );
    }

    return parsed.session_key;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${VAST_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.sessionKey ?? this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text();

      // Vast.ai gates write actions behind a 2FA-authenticated session once the
      // account enables 2FA. If we hit that specific 401 and have a TOTP secret,
      // mint a session key once and retry transparently.
      if (
        res.status === 401 &&
        is2faError(text) &&
        this.totpSecret &&
        !this.sessionKey
      ) {
        this.sessionKey = await this.mintSessionKey();
        return this.request<T>(method, path, body);
      }

      // Surface Vast.ai's two distinct 401 shapes with actionable guidance
      // instead of the raw JSON blob. On a 401 the account either enabled 2FA
      // and the key predates/lacks a 2FA-authenticated session, or the key is
      // missing the `instance_write` permission scope required to deploy.
      if (res.status === 401) {
        if (is2faError(text)) {
          throw new Error(
            "Vast.ai rejected this key with a Two-Factor Authentication error. " +
              "Your account has 2FA enabled and this API key lacks the privilege " +
              "to perform write actions (creating instances). Either regenerate the " +
              "key from the Vast.ai console while 2FA is active with the " +
              "`instance_write` permission, or add your Vast.ai 2FA (TOTP) secret to " +
              `this provider connection so LLMPanel can authenticate. (Vast.ai said: ${text})`,
          );
        }
        throw new Error(
          "Vast.ai rejected this key (401 Unauthorized). Verify the key is correct " +
            "and has the `instance_write` permission required to create instances. " +
            `(Vast.ai said: ${text})`,
        );
      }

      throw new Error(`Vast.ai API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  private buildEnvObject(
    envVars: Record<string, string>,
    portMappings: Array<{ host: number; container: number }>,
  ): Record<string, string> {
    const env: Record<string, string> = { ...envVars };
    for (const pm of portMappings) {
      env[`-p ${pm.container}:${pm.container}`] = "1";
    }
    return env;
  }

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    const gpuCount = input.gpuCount ?? 1;
    const preferredOfferId = input.providerOfferId
      ? Number(input.providerOfferId)
      : null;

    let offer: VastOffer | undefined;
    if (preferredOfferId != null && Number.isFinite(preferredOfferId)) {
      const byIdData = await this.request<VastOffersResponse>(
        "POST",
        `/bundles/`,
        {
          id: { eq: preferredOfferId },
          rentable: { eq: true },
          disk_space: { gte: 50 },
          limit: 1,
        },
      );
      offer = byIdData.offers[0];
    }

    // Fallback: find cheapest rentable offer matching GPU type and count
    if (!offer) {
      const offersData = await this.request<VastOffersResponse>(
        "POST",
        `/bundles/`,
        {
          gpu_name: { eq: input.gpuType },
          rentable: { eq: true },
          num_gpus: { eq: gpuCount },
          disk_space: { gte: 50 },
          order: [["dph_total", "asc"]],
          limit: 10,
        },
      );
      offer = offersData.offers[0];
    }

    if (!offer) {
      throw new Error(`No Vast.ai GPU available for type: ${input.gpuType}`);
    }

    // Step 2: Create the instance on that offer
    const engineImages: Record<string, string> = {
      vllm: "vllm/vllm-openai:latest",
      sglang: "lmsysorg/sglang:latest",
    };

    const tensorParallelArg =
      gpuCount > 1 ? ` --tensor-parallel-size ${gpuCount}` : "";
    const tpSizeArg = gpuCount > 1 ? ` --tp-size ${gpuCount}` : "";
    const kvCacheEnabled = input.kvCacheEnabled ?? true;
    const kvCacheArg = kvCacheEnabled
      ? " --enable-prefix-caching"
      : " --no-prefix-caching";
    const sglangCacheArg = kvCacheEnabled
      ? " --enable-cache-report"
      : " --disable-radix-cache";
    const vllmSpecArg = vllmSpeculativeArg(input);
    const sglangSpecArg = sglangSpeculativeArg(input);

    const engineOnstart: Record<string, string> = {
      vllm: `vllm serve $MODEL_ID --host 0.0.0.0 --port 8000 --max-model-len ${input.maxModelLen}${tensorParallelArg}${kvCacheArg}${vllmSpecArg}`,
      sglang: `python -m sglang.launch_server --model-path $MODEL_ID --host 0.0.0.0 --port 8000${tpSizeArg}${sglangCacheArg}${sglangSpecArg}`,
    };

    const image = engineImages[input.inferenceEngine];
    const onstart = engineOnstart[input.inferenceEngine];

    const env = this.buildEnvObject(
      {
        MODEL_ID: input.huggingfaceId,
        HF_TOKEN: process.env.HF_TOKEN ?? "",
        HUGGING_FACE_HUB_TOKEN: process.env.HF_TOKEN ?? "",
        ...(input.envVars ?? {}),
      },
      [{ host: 8000, container: 8000 }],
    );

    const result = await this.request<VastCreateResponse>(
      "PUT",
      `/asks/${offer.id}/`,
      {
        client_id: "me",
        image,
        onstart,
        env,
        runtype: "ssh_direct",
        image_login: null,
        label: `llmpanel-${input.deploymentId}`,
      },
    );

    if (!result.success) {
      throw new Error("Vast.ai failed to create instance");
    }

    return {
      externalId: String(result.new_contract),
      status: "provisioning",
      endpoint: null,
      gpuType: input.gpuType,
      costPerHour: offer.dph_total,
    };
  }

  async startDeployment(externalId: string): Promise<void> {
    await this.request("PUT", `/instances/${externalId}/`, {
      state: "running",
    });
  }

  async stopDeployment(externalId: string): Promise<void> {
    await this.request("PUT", `/instances/${externalId}/`, {
      state: "stopped",
    });
  }

  async restartDeployment(externalId: string): Promise<void> {
    await this.stopDeployment(externalId);
    await this.startDeployment(externalId);
  }

  async destroyDeployment(externalId: string): Promise<void> {
    await this.request("DELETE", `/instances/${externalId}/`);
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    // Single instance endpoint returns the instance object directly
    const instance = await this.request<VastInstance>(
      "GET",
      `/instances/${externalId}/`,
    );

    if (!instance) {
      throw new Error(`Instance ${externalId} not found on Vast.ai`);
    }

    const portBinding = instance.ports?.["8000/tcp"]?.[0];
    const endpoint =
      portBinding && instance.public_ipaddr
        ? `http://${instance.public_ipaddr}:${portBinding.HostPort}`
        : null;

    const status = instance.actual_status ?? instance.cur_state;
    const statusMap: Partial<Record<string, DeploymentInfo["status"]>> = {
      created: "provisioning",
      loading: "downloading",
      running: "running",
      stopped: "stopped",
      exited: "stopped",
    };

    return {
      externalId,
      status: statusMap[status] ?? "provisioning",
      endpoint,
      gpuType: instance.gpu_name,
      costPerHour: instance.dph_total,
      // e.g. "Successfully loaded vllm/vllm-openai" — Vast's own progress line.
      statusDetail: instance.status_msg?.trim() || null,
    };
  }

  async *streamLogs(externalId: string): AsyncGenerator<string> {
    let lastLineCount = 0;
    const maxPolls = 200;
    const pollIntervalMs = 3000;

    for (let i = 0; i < maxPolls; i++) {
      try {
        const logResp = await this.request<VastLogResponse>(
          "PUT",
          `/instances/request_logs/${externalId}/`,
          { tail: "1000" },
        );

        if (logResp.success && logResp.result_url) {
          const textRes = await fetch(logResp.result_url);
          if (textRes.ok) {
            const text = await textRes.text();
            const lines = text.split("\n");
            const newLines = lines.slice(lastLineCount);
            for (const line of newLines) {
              if (line.trim()) yield line;
            }
            lastLineCount = lines.length;
          }
        }
      } catch {
        // Log endpoint may not be available yet during provisioning
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  async fetchLogs(externalId: string, tail = 500): Promise<string[]> {
    try {
      const logResp = await this.request<VastLogResponse>(
        "PUT",
        `/instances/request_logs/${externalId}/`,
        { tail: String(tail) },
      );

      if (logResp.success && logResp.result_url) {
        const textRes = await fetch(logResp.result_url);
        if (textRes.ok) {
          const text = await textRes.text();
          return text.split("\n").filter((l) => l.trim());
        }
      }
      return [
        "[Vast.ai] No logs available yet. The instance may still be starting.",
      ];
    } catch {
      return ["[Vast.ai] Failed to fetch container logs."];
    }
  }

  getMetricsCapabilities(): MetricsCapabilities {
    return {
      gpuUtilization: false,
      vram: false,
      temperature: false,
      power: false,
      clocks: false,
      perGpu: false,
      container: false,
      uptime: false,
      costPerHour: false,
    };
  }

  async getMetrics(_externalId: string): Promise<GPUMetrics> {
    throw new Error("Vast.ai does not expose GPU metrics via its API");
  }

  async listAvailableGPUs(): Promise<
    Array<{ type: string; vramGb: number; costPerHour: number | null }>
  > {
    // List all available GPUs (any count) — deduplicate by name
    const data = await this.request<VastOffersResponse>("POST", `/bundles/`, {
      rentable: { eq: true },
      order: [["dph_total", "asc"]],
      limit: 200,
    });

    // Deduplicate by GPU name — keep the cheapest price per type
    const gpuMap = new Map<string, { vramGb: number; costPerHour: number }>();

    for (const offer of data.offers) {
      if (!offer.rentable) continue;
      const existing = gpuMap.get(offer.gpu_name);
      if (!existing || offer.dph_total < existing.costPerHour) {
        gpuMap.set(offer.gpu_name, {
          vramGb: Math.round(offer.gpu_ram / 1024),
          costPerHour: offer.dph_total,
        });
      }
    }

    return Array.from(gpuMap.entries()).map(([type, info]) => ({
      type,
      vramGb: info.vramGb,
      costPerHour: info.costPerHour,
    }));
  }

  async getAvailableVram(gpuType: string): Promise<number> {
    const gpus = await this.listAvailableGPUs();
    return gpus.find((g) => g.type === gpuType)?.vramGb ?? 0;
  }
}
