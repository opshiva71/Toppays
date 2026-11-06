import { useCallback, useEffect, useState } from 'react'

export const ROUTES = ['dashboard', 'send', 'receive', 'swap', 'bridge', 'activity', 'settings'] as const
export type Route = (typeof ROUTES)[number]

function read(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTES as readonly string[]).includes(raw) ? (raw as Route) : 'dashboard'
}

// The pages visited in this session, so "Back" returns to the page you came from and never leaves the app.
const stack: Route[] = []

/**
 * Tiny hash router: #/send, #/swap, ... It needs no library, survives reloads, supports the browser back
 * button and deep links, and works on any static host. `back()` goes to the previous page, or to the
 * dashboard when there is none.
 */
export function useRoute() {
  const [route, setRoute] = useState<Route>(() => {
    const first = read()
    if (stack.length === 0) stack.push(first)
    return first
  })

  useEffect(() => {
    const onChange = () => {
      const next = read()
      if (stack.length > 1 && stack[stack.length - 2] === next) stack.pop()
      else if (stack[stack.length - 1] !== next) stack.push(next)
      setRoute(next)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((next: Route) => {
    if (window.location.hash !== `#/${next}`) window.location.hash = `#/${next}`
  }, [])

  const back = useCallback(() => {
    if (stack.length > 1) window.history.back()
    else navigate('dashboard')
  }, [navigate])

  return { route, navigate, back }
}
