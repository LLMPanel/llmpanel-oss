import type { AgentSourceType } from "@/hooks/use-deployment-agents"

export function AgentSourceBadge({ sourceType }: { sourceType: AgentSourceType }) {
  const local = sourceType === "deployment"
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span className={local ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-primary"} />
      {local ? "Local" : "OpenAI‑compatible"}
    </span>
  )
}
