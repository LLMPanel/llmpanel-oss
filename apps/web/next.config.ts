import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import path from "node:path";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image — ships only the traced
  // node_modules rather than the whole pnpm workspace.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "..", ".."),

  // Workspace packages ship raw TypeScript (main: src/index.ts) — Next has to
  // compile them itself.
  transpilePackages: ["@llmpanel/shared"],

  // Pin the workspace root to this monorepo. Otherwise Next infers it from a
  // stray /Users/sree/package-lock.json and tries to scan the home directory,
  // which fails with "Permission denied (os error 13)".
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_URL}/api/v1/:path*`,
      },
      {
        source: "/api/auth/:path*",
        destination: `${API_URL}/api/auth/:path*`,
      },
      // OpenAI-compatible gateway (agents/chat/completions with gpup_sk_ keys).
      // Keeps the endpoint URLs shown in the dashboard callable on this origin.
      {
        source: "/v1/:path*",
        destination: `${API_URL}/v1/:path*`,
      },
    ]
  },
};

// Source-map upload only runs when SENTRY_ORG/PROJECT/AUTH_TOKEN are set;
// without them this wrapper only injects the runtime instrumentation.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // Errors from browsers with ad-blockers still reach Sentry via this
  // same-origin proxy route.
  tunnelRoute: "/sentry-tunnel",
});
