"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react"

type Theme = "light" | "dark" | "system"

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

const THEME_KEY = "llmpanel-theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"

// The saved choice lives in localStorage and the OS preference in a media
// query — both outside React, so both are read with useSyncExternalStore. The
// server snapshot matches what the server rendered; the real value arrives on
// the client's next render (the inline script in app/layout.tsx has already
// set the class by then, so nothing flashes).
const themeListeners = new Set<() => void>()

// Used only when localStorage throws (storage disabled): the choice then lasts
// until reload.
let unsavedTheme: Theme = "light"

function subscribeTheme(onChange: () => void) {
  themeListeners.add(onChange)
  window.addEventListener("storage", onChange)
  return () => {
    themeListeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

function readSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === "dark" || saved === "system" || saved === "light" ? saved : "light"
  } catch {
    return unsavedTheme
  }
}

function subscribeSystemTheme(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

function readSystemDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readSavedTheme, () => "light" as const)
  const systemDark = useSyncExternalStore(subscribeSystemTheme, readSystemDark, () => false)
  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
  }, [resolvedTheme])

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      unsavedTheme = t
    }
    themeListeners.forEach((notify) => notify())
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
