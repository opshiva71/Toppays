import { useRpcHealth } from '@/hooks/useArc'

/** Live network pill: green only when the Arc RPC just answered as chain 5042. Shows the real round-trip time. */
export function NetworkPill({ compact = false, tone = 'default' }: { compact?: boolean; tone?: 'default' | 'light' }) {
  const { data: health } = useRpcHealth()
  const state = health ? (health.ok ? 'ok' : 'down') : 'checking'
  const color = state === 'ok' ? 'var(--success)' : state === 'down' ? 'var(--danger)' : 'var(--warning)'
  const label = state === 'ok' ? 'Arc Mainnet' : state === 'down' ? 'Arc RPC offline' : 'Connecting'
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
      style={
        tone === 'light'
          ? { borderColor: 'rgba(255,255,255,0.22)', background: 'rgba(8,13,27,0.28)', color: '#fff' }
          : { borderColor: 'var(--border)', background: 'var(--fill)', color: 'var(--ink-2)' }
      }
      title={state === 'ok' ? 'Connected to Arc Mainnet (chain 5042)' : undefined}
    >
      <span className="relative flex size-2">
        {state === 'ok' && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden" style={{ background: color }} />}
        <span className="relative inline-flex size-2 rounded-full" style={{ background: color }} />
      </span>
      {label}
      {!compact && health?.ok && (
        <span className="tabular-nums" style={{ color: tone === 'light' ? 'rgba(255,255,255,0.7)' : 'var(--subtle)' }}>
          · {health.latencyMs} ms
        </span>
      )}
    </span>
  )
}
