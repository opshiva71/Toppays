import { useDisconnect } from 'wagmi'
import { LogOut, SlidersHorizontal } from 'lucide-react'
import { useRpcHealth } from '@/hooks/useArc'
import { shortAddress } from '@/lib/format'
import { Wordmark } from './Logo'

interface HeaderProps {
  address?: string
  connectorName?: string
  onOpenSettings: () => void
}

/** A soft gradient avatar derived from the address, so a wallet is recognisable at a glance. Decorative only. */
function avatarGradient(address: string): string {
  const hex = address.replace(/^0x/, '')
  const a = parseInt(hex.slice(0, 4), 16) % 360
  const b = (a + 50 + (parseInt(hex.slice(-4), 16) % 60)) % 360
  return `linear-gradient(135deg, hsl(${a} 72% 62%), hsl(${b} 70% 48%))`
}

/** The live network pill: green only when the Arc RPC answered as chain 5042 just now. */
function NetworkPill() {
  const health = useRpcHealth()
  const state = health.data ? (health.data.ok ? 'ok' : 'down') : 'checking'
  const color = state === 'ok' ? 'var(--success)' : state === 'down' ? 'var(--danger)' : 'var(--warning)'
  const label = state === 'ok' ? 'Arc Mainnet' : state === 'down' ? 'Arc RPC offline' : 'Connecting'
  return (
    <span
      className="hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex"
      style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
      title={state === 'ok' ? 'Connected to Arc Mainnet (chain 5042)' : undefined}
    >
      <span className="relative flex size-2">
        {state === 'ok' && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-50 motion-reduce:hidden" style={{ background: color }} />}
        <span className="relative inline-flex size-2 rounded-full" style={{ background: color }} />
      </span>
      {label}
    </span>
  )
}

export function Header({ address, connectorName, onOpenSettings }: HeaderProps) {
  const { disconnect } = useDisconnect()

  return (
    <header className="sticky top-0 z-30 mx-auto w-full max-w-2xl px-3 pb-2 pt-3 sm:px-4 sm:pt-4">
      <div className="topbar flex items-center justify-between gap-2 py-1.5 pl-3 pr-1.5 sm:pl-4">
        <div className="flex shrink-0 items-center gap-3">
          <Wordmark />
          <NetworkPill />
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings and developer info"
            className="btn btn-ghost !size-11 !min-h-11 !rounded-full !px-0"
          >
            <SlidersHorizontal className="size-[18px]" />
          </button>
          {address && (
            <div
              className="flex items-center gap-2 rounded-full py-0.5 pl-3 pr-0.5 text-[11px] font-semibold sm:pl-1 sm:text-xs"
              style={{ background: 'var(--surface-muted)' }}
              title={connectorName}
            >
              <span className="hidden size-8 shrink-0 rounded-full sm:block" style={{ background: avatarGradient(address) }} aria-hidden="true" />
              <span className="mono tabular-nums">{shortAddress(address)}</span>
              <button
                type="button"
                onClick={() => disconnect()}
                aria-label="Disconnect wallet"
                className="btn btn-ghost !min-h-11 !w-11 !rounded-full !px-0"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
