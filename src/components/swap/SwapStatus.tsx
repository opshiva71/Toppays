import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_MAINNET_CHAIN_ID } from '../../../config/network'
import type { SwapTokenConfig } from '../../../config/uniswap'
import type { SwapExecution } from '@/hooks/useUniswapSwap'
import { formatTokenAmount } from '@/services/swapTokens'
import { StatusBadge } from '../StatusBadge'

interface SwapStatusProps {
  execution: SwapExecution
  tokenOut: SwapTokenConfig
  onDismiss: () => void
}

/** Progress and result of an approval or swap. Success is shown only after the receipt confirms onchain. */
export function SwapStatus({ execution, tokenOut, onDismiss }: SwapStatusProps) {
  const { phase, kind, hash, message } = execution
  if (phase === 'idle') return null
  const explorer = hash ? buildTxExplorerUrl(ARC_MAINNET_CHAIN_ID, hash) : null
  const what = kind === 'approval' ? 'approval' : 'swap'

  if (phase === 'submitting' || phase === 'approving') {
    return (
      <div className="inner flex items-start gap-3 p-4 text-sm" role="status" aria-live="polite">
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
        <div>
          <StatusBadge status="pending" label="Waiting for wallet" />
          <p className="mt-2">
            {phase === 'submitting'
              ? 'Simulated successfully. Confirm the swap in your wallet. Nothing is sent until you approve.'
              : 'Confirm the approval in your wallet. Nothing is sent until you approve.'}
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'pending') {
    return (
      <div className="inner space-y-2 p-4 text-sm" role="status" aria-live="polite">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          <StatusBadge status="pending" />
        </div>
        <p>Waiting for Arc Mainnet to confirm your {what}.</p>
        {explorer && (
          <a href={explorer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
            View transaction <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    )
  }

  if (phase === 'confirmed') {
    return (
      <div className="space-y-3 rounded-2xl p-4 text-sm" style={{ background: 'rgba(26,128,71,0.08)' }} role="status" aria-live="polite">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5" style={{ color: 'var(--success)' }} />
          <StatusBadge status="confirmed" label="Swap confirmed" />
        </div>
        {execution.receivedDelta !== undefined && execution.receivedDelta !== null && (
          <p>
            Received <strong>{formatTokenAmount(execution.receivedDelta, tokenOut, 6)} {tokenOut.symbol}</strong>
            <span style={{ color: 'var(--muted)' }}> (change in your balance after confirmation)</span>
          </p>
        )}
        {execution.blockNumber !== undefined && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Confirmed in block {execution.blockNumber.toString()}.
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          {explorer && (
            <a href={explorer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
              View transaction <ExternalLink className="size-3" />
            </a>
          )}
          <button type="button" className="btn btn-secondary" onClick={onDismiss}>
            Swap again
          </button>
        </div>
      </div>
    )
  }

  const status = phase === 'rejected' ? 'cancelled' : phase === 'unconfirmed' ? 'unconfirmed' : 'failed'
  return (
    <div className="space-y-2 rounded-2xl p-4 text-sm" style={{ background: phase === 'rejected' ? 'var(--surface-muted)' : 'rgba(186,43,76,0.08)' }} role="alert">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4" style={{ color: phase === 'rejected' ? 'var(--muted)' : 'var(--danger)' }} />
        {execution.reason === 'rpc' ? <StatusBadge status="pending" label="Could not simulate" /> : <StatusBadge status={status} />}
      </div>
      <p>{message}</p>
      {execution.diagnostics && execution.diagnostics.length > 0 && <TechnicalDetails lines={execution.diagnostics} />}
      <div className="flex items-center justify-between gap-3">
        {explorer ? (
          <a href={explorer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
            View transaction <ExternalLink className="size-3" />
          </a>
        ) : (
          <span />
        )}
        <button type="button" className="btn btn-secondary" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

/** The real facts behind a stopped swap: stage, decoded revert reason, amounts, allowance, deadline, RPC text. */
function TechnicalDetails({ lines }: { lines: readonly string[] }) {
  const text = lines.join('\n')
  return (
    <details className="rounded-xl p-3 text-xs" style={{ background: 'rgba(255,255,255,0.6)' }}>
      <summary className="cursor-pointer font-semibold">Technical details</summary>
      <pre className="mono mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">{text}</pre>
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-1 font-semibold"
        style={{ color: 'var(--accent-hover)' }}
        onClick={() => void navigator.clipboard?.writeText(text)}
      >
        <Copy className="size-3" /> Copy details
      </button>
    </details>
  )
}
