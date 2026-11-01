import { useRpcHealth } from '@/hooks/useArc'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'

/** Slim network and RPC status strip for the main dashboard. Developer details live in Settings. */
export function NetworkInfo({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data: health, isLoading } = useRpcHealth()
  const online = health?.ok === true
  const dot = isLoading || !health ? 'var(--subtle)' : online ? 'var(--success)' : 'var(--danger)'

  return (
    <section
      className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-xs sm:px-5"
      aria-label="Network information"
    >
      <span className="flex items-center gap-2 font-semibold">
        <span className="size-2 rounded-full" style={{ background: dot }} aria-hidden="true" />
        Arc Mainnet
        <span className="font-medium tabular-nums" style={{ color: 'var(--subtle)' }}>
          Chain {ARC_MAINNET_CHAIN_ID}
        </span>
      </span>

      <span className="flex items-center gap-3" style={{ color: 'var(--muted)' }}>
        {isLoading || !health ? (
          <span>Checking RPC…</span>
        ) : health.ok ? (
          <span className="tabular-nums">
            RPC online · Block {health.blockNumber.toString()} · {health.latencyMs} ms
          </span>
        ) : (
          <span role="status" style={{ color: 'var(--danger)' }}>
            {health.message}
          </span>
        )}
        <button type="button" onClick={onOpenSettings} className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--accent-hover)' }}>
          Details
        </button>
      </span>
    </section>
  )
}
