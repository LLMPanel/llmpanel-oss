import { exec } from "child_process"
import { promisify } from "util"
import type { Context } from "hono"
import { env } from "../env"
import { isEmailConfigured } from "../services/email.service"

const execAsync = promisify(exec)

const MOCK_GPU_RESPONSE = {
  detected: true,
  gpus: [
    {
      index: 0,
      name: "NVIDIA GeForce RTX 4080 (mock)",
      totalVramMb: 16384,  // 16 GB
      freeVramMb: 15800,
      usedVramMb: 584,
      utilizationPercent: 0,
      temperatureCelsius: 42,
    },
  ],
} as const

// nvidia-smi fields: index, name, total mem (MiB), free mem (MiB), used mem (MiB), gpu util (%), temp (°C)
const NVIDI_SMI_CMD =
  "nvidia-smi --query-gpu=index,name,memory.total,memory.free,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits"

export async function getSystemGpu(c: Context) {
  if (env.MOCK_GPU) {
    return c.json(MOCK_GPU_RESPONSE)
  }

  // The installer already probed the host and found nothing — don't shell out to
  // an nvidia-smi that isn't there just to rediscover that.
  if (!env.GPU_AVAILABLE) {
    return c.json({
      detected: false,
      gpus: [],
      error: "No GPU detected on this host — cloud providers only",
    })
  }

  try {
    const { stdout } = await execAsync(NVIDI_SMI_CMD)

    const lines = stdout.trim().split("\n").filter(Boolean)

    const gpus = lines.map(line => {
      const parts = line.split(", ").map(s => s.trim())
      const [index, name, totalMb, freeMb, usedMb, utilPct, tempC] = parts

      return {
        index: parseInt(index ?? "0", 10),
        name: name ?? "Unknown GPU",
        totalVramMb: parseInt(totalMb ?? "0", 10),
        freeVramMb: parseInt(freeMb ?? "0", 10),
        usedVramMb: parseInt(usedMb ?? "0", 10),
        utilizationPercent: parseInt(utilPct ?? "0", 10),
        temperatureCelsius: parseInt(tempC ?? "0", 10),
      }
    })

    return c.json({ detected: true, gpus })
  } catch {
    // nvidia-smi not installed or no NVIDIA GPU on this machine
    return c.json({
      detected: false,
      gpus: [],
      error: "nvidia-smi not available or no NVIDIA GPU detected on this host",
    })
  }
}

export async function getSystemInfo(c: Context) {
  return c.json({
    deploymentMode: env.DEPLOYMENT_MODE,
    // Lets the UI hide email-dependent features (email OTP, resend-verification)
    // on installs with no email provider configured.
    emailConfigured: isEmailConfigured(),
    version: "1.0.0",
  })
}
