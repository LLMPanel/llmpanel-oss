// Shared cloud-init bootstrap for VM-based GPU providers.
//
// Container providers (RunPod, Vast.ai) hand the engine command straight to
// the platform. VM providers (Lambda Cloud, TensorDock, DataCrunch,
// Hyperstack) instead get a bare Ubuntu box, so we ship a first-boot script
// that installs two systemd units:
//   llmpanel-engine — the inference engine in Docker, output tee'd to a file
//   llmpanel-agent  — the same stdlib-only metrics/logs agent RunPod pods run
// systemd keeps both alive across instance restarts, which is what makes
// logs and per-GPU metrics work on providers whose APIs expose neither.

import type { DeployModelInput } from "../types"
import { METRICS_AGENT_PY, METRICS_AGENT_PORT, ENGINE_LOG_FILE } from "./agent-script"
import { vllmSpeculativeArg } from "./speculative"

export const INFERENCE_PORT = 8000

const ENGINE_IMAGES: Record<string, string> = {
  vllm: "vllm/vllm-openai:latest",
  sglang: "lmsysorg/sglang:latest",
}

/** Single-quote a string for safe embedding in a shell command. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export interface BootstrapOptions {
  /** GPU count the hardware actually has — drives tensor parallelism. On
   *  providers with fixed instance types this is the type's GPU count, not
   *  the user's requested count. */
  gpuCount: number
  /** Install Docker before starting the engine, for images that lack it. */
  installDocker?: boolean
}

/** The engine invocation for a deploy request, as a full command line. */
export function engineCommand(input: DeployModelInput, gpuCount: number): string {
  const extraArgs = input.extraArgs?.trim() ? ` ${input.extraArgs.trim()}` : ""
  if (input.inferenceEngine === "sglang") {
    return `python3 -m sglang.launch_server --model-path ${input.huggingfaceId} --host 0.0.0.0 --port ${INFERENCE_PORT}${gpuCount > 1 ? ` --tp-size ${gpuCount}` : ""}${extraArgs}`
  }
  const tensorParallelArg = gpuCount > 1 ? ` --tensor-parallel-size ${gpuCount}` : ""
  const kvCacheArg = (input.kvCacheEnabled ?? true)
    ? " --enable-prefix-caching"
    : " --no-prefix-caching"
  const specArg = vllmSpeculativeArg(input)
  return `python3 -m vllm.entrypoints.openai.api_server --model ${input.huggingfaceId} --host 0.0.0.0 --port ${INFERENCE_PORT} --max-model-len ${input.maxModelLen}${tensorParallelArg}${kvCacheArg}${specArg}${extraArgs}`
}

/** The plain shell script run on first boot. Exposed for providers whose API
 *  takes a startup script rather than cloud-init user-data. */
export function buildBootstrapScript(
  input: DeployModelInput,
  { gpuCount, installDocker = false }: BootstrapOptions,
): string {
  const cmd = engineCommand(input, gpuCount)
  const image =
    input.dockerImage?.trim() || ENGINE_IMAGES[input.inferenceEngine] || ENGINE_IMAGES.vllm

  // docker --env-file sidesteps shell quoting for user env vars; values are
  // flattened to single lines (env files can't represent newlines).
  const env: Record<string, string> = {
    HF_TOKEN: process.env.HF_TOKEN ?? "",
    HUGGING_FACE_HUB_TOKEN: process.env.HF_TOKEN ?? "",
    ...(input.envVars ?? {}),
  }
  const envLines = Object.entries(env)
    .map(([k, v]) => `${k}=${v.replace(/\r?\n/g, " ")}`)
    .join("\n")

  const metricsToken = input.envVars?.LLMPANEL_METRICS_TOKEN ?? ""
  const agentB64 = Buffer.from(METRICS_AGENT_PY, "utf8").toString("base64")

  // Installs the distro's docker.io plus the NVIDIA container toolkit. Only
  // used on images that don't already ship them; it's a no-op reinstall
  // otherwise, but skipping it keeps first boot much faster.
  const dockerSetup = installDocker
    ? `
# Docker + NVIDIA Container Toolkit (images that don't ship them)
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y --no-install-recommends docker.io curl gnupg ca-certificates
fi
if ! command -v nvidia-ctk >/dev/null 2>&1; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \\
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \\
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \\
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update -y
  apt-get install -y --no-install-recommends nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
fi
`
    : ""

  return `#!/bin/bash
set -uo pipefail
mkdir -p /opt/llmpanel
${dockerSetup}
# Metrics/logs agent (stdlib-only Python; serves /metrics and /logs)
cat > /opt/llmpanel/agent.b64 <<'OP_EOF_AGENT'
${agentB64}
OP_EOF_AGENT
base64 -d /opt/llmpanel/agent.b64 > /opt/llmpanel/agent.py

cat > /opt/llmpanel/engine.env <<'OP_EOF_ENV'
${envLines}
OP_EOF_ENV
chmod 600 /opt/llmpanel/engine.env

cat > /opt/llmpanel/run-engine.sh <<'OP_EOF_RUN'
#!/bin/bash
docker rm -f llmpanel-engine 2>/dev/null || true
docker run --name llmpanel-engine --gpus all --ipc=host \\
  -p ${INFERENCE_PORT}:${INFERENCE_PORT} \\
  --env-file /opt/llmpanel/engine.env \\
  --entrypoint bash \\
  ${shellQuote(image)} -c ${shellQuote(`exec ${cmd}`)} 2>&1 | tee -a ${ENGINE_LOG_FILE}
OP_EOF_RUN
chmod +x /opt/llmpanel/run-engine.sh

cat > /etc/systemd/system/llmpanel-agent.service <<'OP_EOF_UNIT1'
[Unit]
Description=LLMPanel metrics and logs agent
After=network-online.target

[Service]
Environment=LLMPANEL_METRICS_TOKEN=${metricsToken}
Environment=LLMPANEL_AGENT_PORT=${METRICS_AGENT_PORT}
Environment=LLMPANEL_LOG_FILE=${ENGINE_LOG_FILE}
ExecStart=/usr/bin/python3 /opt/llmpanel/agent.py
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
OP_EOF_UNIT1

cat > /etc/systemd/system/llmpanel-engine.service <<'OP_EOF_UNIT2'
[Unit]
Description=LLMPanel inference engine
After=docker.service network-online.target
Requires=docker.service

[Service]
ExecStart=/bin/bash /opt/llmpanel/run-engine.sh
Restart=always
RestartSec=5
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
OP_EOF_UNIT2

systemctl daemon-reload
systemctl enable --now llmpanel-agent.service
systemctl enable --now llmpanel-engine.service
`
}

/**
 * The same bootstrap wrapped as cloud-init user-data. The script is
 * base64-embedded so the surrounding YAML stays trivial no matter what the
 * script contains.
 */
export function buildCloudInit(input: DeployModelInput, options: BootstrapOptions): string {
  const scriptB64 = Buffer.from(buildBootstrapScript(input, options), "utf8").toString("base64")
  return [
    "#cloud-config",
    "write_files:",
    "  - path: /opt/llmpanel/bootstrap.sh",
    '    permissions: "0755"',
    "    encoding: b64",
    `    content: ${scriptB64}`,
    "runcmd:",
    "  - [bash, /opt/llmpanel/bootstrap.sh]",
    "",
  ].join("\n")
}

export { METRICS_AGENT_PORT, ENGINE_LOG_FILE }
