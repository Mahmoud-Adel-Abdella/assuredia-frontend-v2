import { useCallback, useEffect, useState } from "react"

/**
 * Theme preference — the single existing theme architecture:
 * the `dark` class on <html> + the `theme` key in localStorage
 * (applied before first paint in src/main.tsx). This hook only
 * centralizes reads/writes of that same mechanism so the header
 * toggle and the Settings preference stay in sync through the DOM.
 */
const THEME_KEY = "theme"

function readDark(): boolean {
  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("dark")
  }
  try {
    return localStorage.getItem(THEME_KEY) !== "light"
  } catch {
    return true
  }
}

export function useTheme(): { dark: boolean; toggle: () => void; setDark: (v: boolean) => void } {
  const [dark, setDarkState] = useState(readDark)

  // Follow external flips of the .dark class (e.g. the header toggle).
  useEffect(() => {
    const el = document.documentElement
    const update = () => setDarkState(el.classList.contains("dark"))
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  const setDark = useCallback((next: boolean) => {
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light")
    } catch {
      /* ignore storage failures */
    }
    setDarkState(next)
  }, [])

  const toggle = useCallback(() => setDark(!readDark()), [setDark])

  return { dark, toggle, setDark }
}
