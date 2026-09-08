// In-memory sliding-window rate limiter. Keys are arbitrary strings
// (channels use `${channelId}:${platformUserId}`); state is process-local,
// which is fine for the single API process that owns the channel adapters.
export class SlidingWindowLimiter {
  private windows = new Map<string, number[]>()

  /** Returns true when the call is allowed and records it. */
  allow(key: string, limit: number, windowMs = 60_000): boolean {
    const now = Date.now()
    const cutoff = now - windowMs
    const timestamps = (this.windows.get(key) ?? []).filter((t) => t > cutoff)
    if (timestamps.length >= limit) {
      this.windows.set(key, timestamps)
      return false
    }
    timestamps.push(now)
    this.windows.set(key, timestamps)
    return true
  }

  /** Drop all keys starting with the prefix (e.g. on channel stop). */
  clearPrefix(prefix: string): void {
    for (const key of this.windows.keys()) {
      if (key.startsWith(prefix)) this.windows.delete(key)
    }
  }
}

// Shared limiter for gateway API keys (`rpm:<keyId>` / `day:<keyId>`).
export const apiKeyRateLimiter = new SlidingWindowLimiter()
