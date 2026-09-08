import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

import { DEFAULT_REDIRECT } from "@/lib/safe-redirect"

const AUTH_ROUTES = ["/login", "/register", "/forgot-password"]

// Read statically so Next can inline it into the edge bundle. Passing the whole
// `process.env` object (as @/env does) is not reliable outside the node runtime.
const API_URL = process.env.HONO_API_URL ?? "http://localhost:8000"

/**
 * Asks the API whether the request's session cookie is actually valid.
 *
 * A presence check on the cookie is not enough: an expired or revoked token is
 * still a cookie, so it would sail past the dashboard and only fail later when
 * the page's data fetches start coming back 401.
 */
async function hasValidSession(request: NextRequest): Promise<boolean> {
  // No cookie at all is already a definitive answer — skip the round-trip.
  const cookie = request.headers.get("cookie")
  if (!cookie || !getSessionCookie(request)) return false

  try {
    const response = await fetch(`${API_URL}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    })
    if (!response.ok) return false

    // Better Auth answers 200 with a literal `null` body for an invalid or
    // expired token, so validity lives in the body, not the status code.
    const session = await response.json()
    return Boolean(session?.user)
  } catch {
    // API unreachable. Fail closed: an unauthenticated dashboard is worse than
    // an unreachable one, and every panel on it would fail to load anyway.
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isAuthed = await hasValidSession(request)

  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(isAuthed ? DEFAULT_REDIRECT : "/login", request.url)
    )
  }

  if (AUTH_ROUTES.includes(pathname)) {
    return isAuthed
      ? NextResponse.redirect(new URL(DEFAULT_REDIRECT, request.url))
      : NextResponse.next()
  }

  if (!isAuthed) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

// `/invite/:id` is deliberately absent: an invitee arrives without a session and
// must be able to load the page, which then sends them to
// /login?redirect=/invite/<id> itself and returns them here after sign-in.
export const config = {
  matcher: ["/", "/login", "/register", "/forgot-password", "/dashboard/:path*"],
}
