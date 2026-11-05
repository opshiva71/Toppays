import { useCallback, useEffect, useState } from 'react'

export const ROUTES = ['dashboard', 'send', 'receive', 'swap', 'bridge', 'activity', 'settings'] as const
export type Route = (typeof ROUTES)[number]

function read(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTES as readonly string[]).includes(raw) ? (raw as Route) : 'dashboard'
}

/**
 * Tiny hash router: #/send, #/swap, ... It needs no library, survives reloads, supports the back button
 * and deep links, and works on any static host.
 */
export function useRoute() {
  const [route, setRoute] = useState<Route>(read)

  useEffect(() => {
    const onChange = () => {
      setRoute(read())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((next: Route) => {
    if (window.location.hash !== `#/${next}`) window.location.hash = `#/${next}`
  }, [])

  return { route, navigate }
}
