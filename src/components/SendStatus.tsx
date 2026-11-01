import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'
import { formatUsdcRaw, shortAddress } from '@/lib/format'
import type { useSendUsdc } from '@/hooks/useSendUsdc'
import { StatusBadge, type BadgeStatus } from './StatusBadge'

interface SendStatusProps {
  send: ReturnType<typeof useSendUsdc>
  onDone: () => void
}

/** Renders only states the hook derived from the wallet and the chain. Success appears only after a mined, successful receipt. */
export function SendStatus({ send, onDone }: SendStatusProps) {
  const { state, recheck, backToEdit } = send
  const { phase, quote, hash } = state
  const explorerUrl = hash ? buildTxExplorerUrl(ARC_MAINNET_CHAIN_ID, hash) : null
  const summary = quote ? `${formatUsdcRaw(quote.amount.raw)} USDC to ${shortAddress(quote.to, 8, 6)}` : ''

  let icon = <Loader2 className="size-9 animate-spin" style={{ color: 'var(--accent-hover)' }} />
  let title = ''
  let body = ''

  switch (phase) {
    case 'awaiting-wallet':
      title = 'Confirm in your wallet'
      body = 'Approve the payment in your wallet window. Nothing is sent until you approve.'
      break
    case 'pending':
      title = 'Waiting for confirmation'
      body = 'Submitted to Arc Mainnet. Waiting for it to be included in a block.'
      break
    case 'confirmed':
      icon = <CheckCircle2 className="size-9" style={{ color: 'var(--success)' }} />
      title = 'Payment confirmed'
      body = state.blockNumber !== undefined ? `Included in block ${state.blockNumber.toString()}. Arc finality is immediate.` : 'Included onchain.'
      break
    case 'failed':
      icon = <XCircle className="size-9" style={{ color: 'var(--danger)' }} />
      title = 'Payment failed'
      body = state.message ?? 'The payment did not go through.'
      break
    case 'rejected':
      icon = <XCircle className="size-9" style={{ color: 'var(--subtle)' }} />
      title = 'Cancelled in wallet'
      body = state.message ?? 'You rejected the request. Nothing was sent.'
      break
    case 'unconfirmed':
      icon = <AlertTriangle className="size-9" style={{ color: 'var(--warning)' }} />
      title = 'Not confirmed yet'
      body = state.message ?? 'Status unknown.'
      break
    default:
      break
  }

  const badge: { status: BadgeStatus; label?: string } | null =
    phase === 'awaiting-wallet'
      ? { status: 'pending', label: 'Awaiting wallet' }
      : phase === 'pending'
        ? { status: 'pending' }
        : phase === 'confirmed'
          ? { status: 'confirmed' }
          : phase === 'failed'
            ? { status: 'failed' }
            : phase === 'rejected'
              ? { status: 'cancelled' }
              : phase === 'unconfirmed'
                ? { status: 'unconfirmed' }
                : null

  const finished = phase === 'confirmed' || phase === 'failed' || phase === 'rejected' || phase === 'unconfirmed'

  return (
    <div className="space-y-5 pt-2 text-center" aria-live="polite">
      <div className="flex justify-center">{icon}</div>
      <div>
        {badge && (
          <div className="mb-2 flex justify-center">
            <StatusBadge status={badge.status} label={badge.label} />
          </div>
        )}
        <h3 className="display text-2xl font-semibold">{title}</h3>
        {summary && <p className="mt-1 text-sm tabular-nums" style={{ color: 'var(--ink-2)' }}>{summary}</p>}
        <p className="mx-auto mt-2 max-w-xs text-pretty text-sm" style={{ color: 'var(--muted)' }}>
          {body}
        </p>
      </div>

      {hash && (
        <div className="inner space-y-2 p-3 text-left">
          <span className="label">Transaction hash</span>
          <p className="mono break-all text-xs">{hash}</p>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold"
              style={{ color: 'var(--accent-hover)' }}
            >
              View on explorer <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {phase === 'unconfirmed' && (
        <button type="button" className="btn btn-secondary w-full" onClick={() => void recheck()}>
          <RefreshCw className="size-4" /> Check status again
        </button>
      )}
      {phase === 'rejected' && (
        <button type="button" className="btn btn-secondary w-full" onClick={backToEdit}>
          Edit payment
        </button>
      )}
      {phase === 'failed' && !hash && (
        <button type="button" className="btn btn-secondary w-full" onClick={backToEdit}>
          Back to payment
        </button>
      )}
      {finished && (
        <button type="button" className="btn btn-primary w-full" onClick={onDone}>
          Done
        </button>
      )}
    </div>
  )
}
