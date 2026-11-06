import { useState } from 'react'
import { useDisconnect } from 'wagmi'
import { ArrowLeft, Check, Copy, LogOut } from 'lucide-react'
import { copyText, shortAddress } from '@/lib/format'
import { avatarGradient } from '@/lib/avatar'
import type { Route } from '@/hooks/useRoute'
import { ThemeToggle } from '../ThemeToggle'
import { Wordmark } from '../Logo'
import { NetworkPill } from './NetworkPill'
import { navFor } from './nav'

interface TopBarProps {
  route: Route
  address: string
  connectorName?: string
  onBack: () => void
}

/** Top bar. Every page except the dashboard has a Back button. Phones: compact; desktop: title, network pill, wallet chip. */
export function TopBar({ route, address, connectorName, onBack }: TopBarProps) {
  const { disconnect } = useDisconnect()
  const [copied, setCopied] = useState(false)
  const page = navFor(route)
  const home = route === 'dashboard'

  const copy = async () => {
    if (await copyText(address)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <header
      className="sticky top-0 z-30 border-b px-3 py-2.5 sm:px-4 lg:px-8 lg:py-3.5"
      style={{ borderColor: 'var(--border)', background: 'var(--bar-bg)', backdropFilter: 'blur(18px) saturate(150%)', WebkitBackdropFilter: 'blur(18px) saturate(150%)' }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {!home && (
            <button type="button" onClick={onBack} aria-label="Go back" className="btn btn-secondary !min-h-10 !w-10 shrink-0 !rounded-full !px-0 lg:!w-auto lg:!px-3.5">
              <ArrowLeft className="size-[18px]" />
              <span className="hidden lg:inline">Back</span>
            </button>
          )}
          <div className="min-w-0 lg:hidden">
            {home ? <Wordmark size="sm" /> : <span className="display block truncate text-lg font-semibold">{page.label}</span>}
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="display truncate text-xl font-semibold leading-tight">{page.title}</p>
            <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>
              {page.subtitle}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden md:inline-flex">
            <NetworkPill />
          </span>
          <ThemeToggle />
          <div
            className="flex items-center gap-1 rounded-full border py-0.5 pl-3 pr-0.5 text-xs font-semibold sm:gap-1.5 sm:pl-0.5"
            style={{ borderColor: 'var(--border)', background: 'var(--fill)' }}
            title={connectorName}
          >
            <span className="hidden size-8 shrink-0 rounded-full sm:block" style={{ background: avatarGradient(address) }} aria-hidden="true" />
            <span className="mono tabular-nums">{shortAddress(address)}</span>
            <button type="button" onClick={() => void copy()} aria-label={copied ? 'Address copied' : 'Copy wallet address'} className="btn btn-ghost !hidden !min-h-9 !w-9 !rounded-full !px-0 sm:!inline-flex">
              {copied ? <Check className="size-4" style={{ color: 'var(--success)' }} /> : <Copy className="size-4" />}
            </button>
            <button type="button" onClick={() => disconnect()} aria-label="Disconnect wallet" className="btn btn-ghost !min-h-9 !w-9 !rounded-full !px-0">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
