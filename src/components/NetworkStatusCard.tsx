import { ArrowRight } from 'lucide-react'
import { useRpcHealth } from '@/hooks/useArc'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="inner px-3.5 py-3">
      <span className="label">{label}</span>
      <div className="mt-1 text-sm font-semibold tabular-nums">{children}</div>
    </div>
  )
}

/** Network and RPC health from a real round trip to the Arc RPC. Nothing here is estimated. */
export function NetworkStatusCard() {
  const { data: health } = useRpcHealth()
  const online = health?.ok === true
  return (
    <section className="card p-5" aria-label="Network status">
      <div className="flex items-center justify-between">
        <h2 className="display text-lg font-semibold">Network</h2>
        <span className={`badge ${!health ? 'badge-warning' : online ? 'badge-success' : 'badge-danger'}`}>
          {!health ? 'Checking' : online ? 'Connected' : 'Offline'}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Stat label="Network">Arc Mainnet</Stat>
        <Stat label="Chain ID">{ARC_MAINNET_CHAIN_ID}</Stat>
        <Stat label="RPC latency">{health?.ok ? `${health.latencyMs} ms` : health ? '—' : '…'}</Stat>
        <Stat label="Latest block">{health?.ok ? health.blockNumber.toString() : health ? '—' : '…'}</Stat>
      </div>
      {health && !health.ok && (
        <p role="status" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
          {health.message}
        </p>
      )}
      <a href="#/settings" className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
        Network details <ArrowRight className="size-3.5" />
      </a>
    </section>
  )
}
