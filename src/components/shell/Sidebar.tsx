import { ARC_MAINNET_CHAIN_ID } from '../../../config/network'
import { useRpcHealth } from '@/hooks/useArc'
import type { Route } from '@/hooks/useRoute'
import { Wordmark } from '../Logo'
import { NAV } from './nav'

/** Desktop left sidebar: brand, the seven destinations, and a live network card. */
export function Sidebar({ route }: { route: Route }) {
  const { data: health } = useRpcHealth()
  const online = health?.ok === true
  return (
    <aside
      className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col justify-between border-r px-5 py-6 lg:flex"
      style={{ borderColor: 'var(--border)', background: 'rgba(13,20,37,0.72)', backdropFilter: 'blur(18px)' }}
      aria-label="Sidebar"
    >
      <div>
        <a href="#/dashboard" className="block rounded-xl pl-3" aria-label="TopPay dashboard">
          <Wordmark tagline />
        </a>
        <nav className="mt-8 flex flex-col gap-1.5 pl-3" aria-label="Main navigation">
          {NAV.map(({ route: target, label, Icon }) => (
            <a key={target} href={`#/${target}`} className="nav-link" aria-current={route === target ? 'page' : undefined}>
              <Icon className="size-[18px]" aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
      </div>

      <div className="inner p-4 text-xs" aria-label="Network status">
        <div className="flex items-center gap-2 font-semibold">
          <span className="size-2 rounded-full" style={{ background: !health ? 'var(--warning)' : online ? 'var(--success)' : 'var(--danger)' }} aria-hidden="true" />
          Arc Mainnet
        </div>
        <p className="mt-1.5 tabular-nums" style={{ color: 'var(--muted)' }}>
          Chain ID {ARC_MAINNET_CHAIN_ID}
        </p>
        <p className="mt-0.5 tabular-nums" style={{ color: online ? 'var(--muted)' : 'var(--danger)' }}>
          {!health ? 'Checking RPC…' : health.ok ? `RPC online · ${health.latencyMs} ms` : 'RPC unreachable'}
        </p>
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--subtle)' }}>
          Real USDC. Transfers cannot be reversed.
        </p>
      </div>
    </aside>
  )
}
