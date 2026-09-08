import * as Sentry from "@sentry/nextjs"

// Disabled until NEXT_PUBLIC_SENTRY_DSN is set at build time — Sentry.init
// without a DSN is a no-op, so this ships safely before the project exists.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Keep tracing cheap on the free tier; errors are always captured.
  tracesSampleRate: 0.1,

  // Session replay only for sessions that hit an error.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
