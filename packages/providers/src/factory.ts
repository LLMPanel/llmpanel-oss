import type { IGPUProvider } from "./types"
import { LocalProvider } from "./local"
import { RunPodProvider } from "./runpod"
import { VastAIProvider } from "./vastai"
import { HotAisleProvider } from "./hotaisle"
import { ThunderComputeProvider } from "./thundercompute"
import { LambdaLabsProvider } from "./lambdalabs"
import { DataCrunchProvider } from "./datacrunch"
import { HyperstackProvider } from "./hyperstack"
import { TensorDockProvider } from "./tensordock"
import { MockProvider } from "./mock/mock.provider"

export function createProvider(
  type:
    | "local"
    | "runpod"
    | "vastai"
    | "hotaisle"
    | "thundercompute"
    | "lambdalabs"
    | "datacrunch"
    | "hyperstack"
    | "tensordock"
    | "mock",
  apiKey?: string,
  /** Optional Vast.ai TOTP secret used to mint a 2FA session key when required. */
  totpSecret?: string
): IGPUProvider {
  switch (type) {
    case "mock":
      return new MockProvider()
    case "local":
      return new LocalProvider()
    case "runpod":
      if (!apiKey) throw new Error("RunPod API key is required")
      return new RunPodProvider(apiKey)
    case "vastai":
      if (!apiKey) throw new Error("Vast.ai API key is required")
      return new VastAIProvider(apiKey, totpSecret)
    case "hotaisle":
      if (!apiKey) throw new Error("Hot Aisle API key is required")
      return new HotAisleProvider(apiKey)
    case "thundercompute":
      if (!apiKey) throw new Error("Thunder Compute API key is required")
      return new ThunderComputeProvider(apiKey)
    case "lambdalabs":
      if (!apiKey) throw new Error("Lambda Cloud API key is required")
      return new LambdaLabsProvider(apiKey)
    case "datacrunch":
      if (!apiKey) throw new Error("DataCrunch credentials are required")
      return new DataCrunchProvider(apiKey)
    case "hyperstack":
      if (!apiKey) throw new Error("Hyperstack API key is required")
      return new HyperstackProvider(apiKey)
    case "tensordock":
      if (!apiKey) throw new Error("TensorDock API token is required")
      return new TensorDockProvider(apiKey)
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}