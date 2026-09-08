import { useState } from "react"
import { toast } from "sonner"

interface DeployInput {
  modelId: string
  providerId: string
  gpuType: string
  quantization: "fp16" | "int8" | "int4" | "gguf"
  inferenceEngine: "vllm" | "sglang"
}

export function useDeployModel() {
  const [isDeploying, setIsDeploying] = useState(false)

  const deployModel = async (input: DeployInput): Promise<string | null> => {
    setIsDeploying(true)

    try {
      // Check compatibility first
      const compat = await fetch(
        `/api/v1/models/${input.modelId}/compatibility?gpuType=${input.gpuType}&quantization=${input.quantization}`
      ).then(r => r.json())

      if (!compat.compatible) {
        toast.error(`Not enough VRAM. Need ${compat.estimatedVramGb}GB, have ${compat.availableVramGb}GB`)
        return null
      }

      if (compat.warning) {
        toast.warning(compat.warning)
      }

      // Create deployment
      const response = await fetch("/api/v1/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error ?? "Deployment failed")
      }

      const { deployment } = await response.json()
      toast.success("Deployment started!")
      return deployment.id

    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to deploy")
      return null
    } finally {
      setIsDeploying(false)
    }
  }

  return { deployModel, isDeploying }
}