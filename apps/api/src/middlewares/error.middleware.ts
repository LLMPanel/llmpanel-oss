// apps/api/src/middlewares/error.middleware.ts
import { createMiddleware } from "hono/factory"
import { ZodError } from "zod"

export const errorMiddleware = createMiddleware(async (c, next) => {
  try {
    await next()
  } catch (error) {

    // Zod validation error
    if (error instanceof ZodError) {
      return c.json(
        {
          error: "Validation failed",
          issues: error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        400
      )
    }

    // Known operational errors (thrown intentionally)
    if (error instanceof AppError) {
      return c.json(
        {
          error: error.message,
          code: error.code,
        },
        error.statusCode as import("hono/utils/http-status").ContentfulStatusCode
      )
    }

    // Unknown/unexpected errors
    const isDev = process.env.NODE_ENV === "development"

    console.error("[Unhandled Error]", error)

    return c.json(
      {
        error: "Internal server error",
        // only expose stack trace in development
        ...(isDev && {
          detail: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      },
      500
    )
  }
})

// Custom error class for intentional operational errors
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "APP_ERROR"
  ) {
    super(message)
    this.name = "AppError"
  }
}

// Convenience factory helpers
export const notFound = (msg = "Resource not found") =>
  new AppError(msg, 404, "NOT_FOUND")

export const forbidden = (msg = "Forbidden") =>
  new AppError(msg, 403, "FORBIDDEN")

export const badRequest = (msg: string) =>
  new AppError(msg, 400, "BAD_REQUEST")

export const conflict = (msg: string) =>
  new AppError(msg, 409, "CONFLICT")