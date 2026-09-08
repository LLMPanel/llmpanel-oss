import { providerLabel } from "@/lib/provider-registry"

/**
 * Shown in place of the GPU section for providers that don't expose GPU
 * telemetry (RunPod, Vast.ai, …).
 *
 * This used to be a four-cell "Performance" card, but every number in it —
 * throughput, requests/min, average latency, total tokens — is already in the
 * Traffic strip directly above, and the two sections render under identical
 * conditions. All that was left once the duplication was removed is the reason
 * the GPU section is missing, which is one sentence.
 */
export function GpuTelemetryNote({ providerType }: { providerType: string }) {
  return (
    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
      {providerLabel(providerType)} doesn&apos;t expose hardware GPU telemetry.
      The throughput and latency figures above are derived from your gateway
      usage instead.
    </p>
  )
}
