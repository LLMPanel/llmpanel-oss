"use client"

import { useSyncExternalStore } from "react"

// The origin never changes for the life of the document, so there is nothing to
// subscribe to — the store only exists to give React a server snapshot.
const subscribe = () => () => {}
const getSnapshot = () => window.location.origin
const getServerSnapshot = () => ""

/**
 * `window.location.origin`, safe to read during render.
 *
 * Client components are still prerendered on the server, so touching `window`
 * directly would crash there and hydrate with a mismatch. Returns an empty
 * string for the server/hydration pass, then the real origin.
 */
export function useOrigin(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
