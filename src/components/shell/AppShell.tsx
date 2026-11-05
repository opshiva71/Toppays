import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Route } from '@/hooks/useRoute'
import { BottomNav } from './BottomNav'
import { navFor } from './nav'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

interface AppShellProps {
  route: Route
  address: string
  connectorName?: string
  banners?: ReactNode
  children: ReactNode
}

/** Desktop: sidebar + top bar. Mobile: compact top bar + bottom navigation. Pages fade and slide in. */
export function AppShell({ route, address, connectorName, banners, children }: AppShellProps) {
  const reduce = useReducedMotion()
  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar route={route} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar route={route} address={address} connectorName={connectorName} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-5 lg:px-8 lg:pb-12 lg:pt-8">
          {banners}
          {/* Pages without their own heading get one here: visible on phones, screen-reader only beside the desktop top bar. */}
          {route !== 'dashboard' && route !== 'swap' && (
            <h1 className="display mb-4 px-1 text-2xl font-bold tracking-tight lg:sr-only">{navFor(route).title}</h1>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <BottomNav route={route} />
    </div>
  )
}
