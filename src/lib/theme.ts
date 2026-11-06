import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'toppay-theme'

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

let current: Theme = read()
const listeners = new Set<() => void>()

/** Writes the theme to the document (CSS reads [data-theme]) and the browser UI colour. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f6fb' : '#080d1b')
}

export function setTheme(theme: Theme): void {
  current = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private mode: the choice still applies for this visit.
  }
  applyTheme(theme)
  listeners.forEach((listener) => listener())
}

applyTheme(current)

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Dark is the default. The choice is remembered on this device. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current)
  const toggle = useCallback(() => setTheme(current === 'dark' ? 'light' : 'dark'), [])
  return { theme, setTheme, toggle }
}
