import { useState } from 'react'
import { useDisconnect } from 'wagmi'
import { Check, Copy, LogOut } from 'lucide-react'
import { copyText, shortAddress } from '@/lib/format'
import { avatarGradient } from '@/lib/avatar'
import type { Route } from '@/hooks/useRoute'
import { Wordmark } from '../Logo'
import { NetworkPill } from './NetworkPill'
import { navFor } from './nav'

interface TopBarProps {
  route: Route
  address: string
  connectorName?: string
}

/** Top bar. Desktop: page title, network pill, wallet chip. Mobile: compact brand, wallet chip. */
export function TopBar({ route, address, connectorName }: TopBarProps) {
  const { disconnect } = useDisconnect()
  const [copied, setCopied] = useState(false)
  const page = navFor(route)

  const copy = async () => {
    if (await copyText(address)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <header
      className="sticky top-0 z-30 border-b px-4 py-2.5 lg:px-8 lg:py-3.5"
      style={{ borderColor: 'var(--border)', background: 'rgba(8,13,27,0.78)', backdropFilter: 'blur(18px) saturate(150%)', WebkitBackdropFilter: 'blur(18px) saturate(150%)' }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="lg:hidden">
            <Wordmark size="sm" />
          </div>
          <div className="hidden lg:block">
            <p className="display text-xl font-semibold leading-tight">{page.title}</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {page.subtitle}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden md:inline-flex">
            <NetworkPill />
          </span>
          <div
            className="flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-0.5 text-xs font-semibold"
            style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.05)' }}
            title={connectorName}
          >
            <span className="size-8 shrink-0 rounded-full" style={{ background: avatarGradient(address) }} aria-hidden="true" />
            <span className="mono tabular-nums">{shortAddress(address)}</span>
            <button type="button" onClick={() => void copy()} aria-label={copied ? 'Address copied' : 'Copy wallet address'} className="btn btn-ghost !min-h-9 !w-9 !rounded-full !px-0">
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
