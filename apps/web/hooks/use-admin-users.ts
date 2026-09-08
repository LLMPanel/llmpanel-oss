"use client"

import { useState, useEffect, useCallback } from "react"

export interface AdminUser {
  id: string
  username: string
  isLocal: boolean
  name: string
  role: "user" | "admin"
  isActive: boolean
  suspendedAt: string | null
  createdAt: string
  activeSessions?: number
  lastActiveAt?: string | null
}

export interface CreateUserInput {
  username: string
  password: string
  name?: string
  role: "user" | "admin"
}

export interface UpdateUserInput {
  name?: string
  role?: "user" | "admin"
}

export interface UserSession {
  id: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  lastActiveAt: string
  expiresAt: string
}

export interface UserActivityEvent {
  id: string
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await globalThis.fetch(`/api/v1/admin${path}`, {
    credentials: "include",
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init?.headers }
      : init?.headers,
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setIsLoading(true)
    setError(null)
    try {
      const data = await api<{ users: AdminUser[] }>("/users")
      setUsers(data.users)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { users, isLoading, error, refetch: load }
}

/** Fetches a single user plus their live sessions and activity feed. */
export function useAdminUser(id: string) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [sessions, setSessions] = useState<UserSession[]>([])
  const [activity, setActivity] = useState<UserActivityEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setIsLoading(true)
    setError(null)
    try {
      const [userData, sessionData, activityData] = await Promise.all([
        api<{ user: AdminUser }>(`/users/${id}`),
        api<{ sessions: UserSession[] }>(`/users/${id}/sessions`),
        api<{ activity: UserActivityEvent[] }>(`/users/${id}/activity`),
      ])
      setUser(userData.user)
      setSessions(sessionData.sessions)
      setActivity(activityData.activity)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  return { user, sessions, activity, isLoading, error, refetch: load }
}

export async function createUser(body: CreateUserInput): Promise<{ user: AdminUser }> {
  return api("/users", { method: "POST", body: JSON.stringify(body) })
}

export async function updateUser(id: string, body: UpdateUserInput): Promise<{ user: AdminUser }> {
  return api(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) })
}

export async function suspendUser(id: string): Promise<void> {
  await api(`/users/${id}/suspend`, { method: "POST" })
}

export async function activateUser(id: string): Promise<void> {
  await api(`/users/${id}/activate`, { method: "POST" })
}

export async function resetUserPassword(id: string, password: string): Promise<void> {
  await api(`/users/${id}/password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  })
}

export async function revokeUserSession(id: string, sessionId: string): Promise<void> {
  await api(`/users/${id}/sessions/${sessionId}`, { method: "DELETE" })
}

export async function revokeAllUserSessions(id: string): Promise<void> {
  await api(`/users/${id}/sessions`, { method: "DELETE" })
}
