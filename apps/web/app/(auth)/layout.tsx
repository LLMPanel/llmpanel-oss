import type { ReactNode } from "react";
import { Activity, Waypoints, Zap } from "lucide-react";

const FEATURES = [
  {
    icon: Zap,
    title: "One-click deployments",
    description:
      "Ship vLLM and Ollama workloads to local Docker or cloud GPUs in seconds.",
  },
  {
    icon: Activity,
    title: "Real-time GPU monitoring",
    description:
      "Per-device utilization, VRAM, temperature, and alerts out of the box.",
  },
  {
    icon: Waypoints,
    title: "OpenAI-compatible gateway",
    description:
      "Point any SDK at your own endpoint — API keys, usage, and logs included.",
  },
];

// Mirrors the dashboard sidebar header lockup: mark in a tile + wordmark + tagline.
function Wordmark({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card ring-1 ring-border shadow-xs">
        <img
          src="/logo/llmpanel_logo_small.png"
          alt=""
          aria-hidden
          draggable={false}
          className="size-5 select-none object-contain"
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold leading-none tracking-tight">
          LLM <span className="font-medium text-muted-foreground">Panel</span>
        </span>
        <span className="truncate text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground/70">
          Deployment Platform
        </span>
      </span>
    </div>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh antialiased lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden border-r bg-muted/40 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]"
        />
        <div
          aria-hidden
          className="absolute -top-40 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="relative">
          <Wordmark />
        </div>

        <div className="relative flex max-w-md flex-col gap-10">
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Deploy LLMs on your own GPUs
            </h2>
            <p className="text-muted-foreground text-pretty">
              LLMPanel is the open-source control panel for self-hosted AI
              inference — from model to production endpoint.
            </p>
          </div>

          <ul className="flex flex-col gap-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex items-start gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background shadow-xs">
                  <Icon className="size-4 text-foreground" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium leading-snug">{title}</p>
                  <p className="text-sm text-muted-foreground text-pretty">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Open-source LLM deployment platform
        </p>
      </div>

      {/* Form side */}
      <div className="flex flex-col">
        <div className="flex justify-center p-6 lg:hidden">
          <Wordmark />
        </div>
        <div className="flex flex-1 items-start justify-center p-6 pt-4 md:items-center md:p-10 md:pt-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
