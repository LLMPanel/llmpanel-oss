import type { Parameter } from "./endpoints-data"

/** Parameters as an inset-grouped list — one row per param, hairlines between. */
export function ParamTable({ params }: { params: Parameter[] }) {
  return (
    <div className="divide-y divide-black/[0.05] overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:ring-white/[0.06]">
      {params.map((p) => (
        <div key={p.name} className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[11rem_1fr]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2">
              <code className="font-mono text-[13px] font-semibold">{p.name}</code>
              {p.required && (
                <span className="text-[11px] font-medium text-warning">required</span>
              )}
            </div>
            <code className="font-mono text-[11px] text-muted-foreground">{p.type}</code>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] leading-[1.5] text-muted-foreground">{p.description}</p>
            {p.example && (
              <p className="mt-1 text-[12px]">
                <span className="text-muted-foreground/70">Example </span>
                <code className="font-mono text-foreground/80">{p.example}</code>
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
