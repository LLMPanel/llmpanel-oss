import os from "node:os"
import { env } from "../env"

/**
 * Whether local deployments on this host get a GPU. Without one they run on
 * the CPU through llama.cpp. MOCK_GPU stands in a fake GPU for development.
 */
export function hostHasGpu(): boolean {
  return env.MOCK_GPU || env.GPU_AVAILABLE
}

export interface HostCpu {
  cores: number
  totalRamMb: number
  /** RAM the kernel can hand out right now, reclaimable page cache included. */
  availableRamMb: number
}

/**
 * The CPU and memory CPU deployments share. Inside the API container these
 * are still the host's numbers: /proc/meminfo and the CPU list are not
 * namespaced, and llama.cpp containers run without a memory limit.
 */
export function getHostCpu(): HostCpu {
  const mb = (bytes: number) => Math.round(bytes / (1024 * 1024))
  return {
    cores: os.availableParallelism(),
    totalRamMb: mb(os.totalmem()),
    availableRamMb: mb(os.freemem()),
  }
}
