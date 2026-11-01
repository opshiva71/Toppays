import { useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'
import { copyText, formatUsdcRaw, shortAddress, splitDecimal } from '@/lib/format'

interface BalanceCardProps {
  address: string
  balance: bigint | undefined
  loading: boolean
  failed: boolean
  onRetry: () => void
}

/** Deterministic two-tone avatar derived from the address, so each wallet looks distinct. Decorative only. */
function avatarGradient(address: string): string {
  const a = parseInt(address.slice(2, 6), 16) % 360
  const b = (a + 48 + (parseInt(address.slice(6, 8), 16) % 60)) % 360
  return `linear-gradient(135deg, hsl(${a} 62% 62%), hsl(${b} 66% 48%))`
}

export function BalanceCard({ address, balance, loading, failed, onRetry }: BalanceCardProps) {
  const [copied, setCopied] = useState(false)
  const { whole, fraction } = splitDecimal(formatUsdcRaw(balance ?? 0n))
  const gradient = useMemo(() => avatarGradient(address), [address])
  // Two decimals stay prominent; any extra precision is shown smaller.
  const main = fraction.slice(0, 3)
  const extra = fraction.slice(3)

  const copy = async () => {
    if (await copyText(address)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <section className="card hero relative overflow-hidden p-6 sm:p-8" aria-label="Balance">
      <div className="flex items-center justify-between gap-3">
        <span className="label">Total balance</span>
        <span className="chip px-2.5 py-1 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
          <TokenUSDC variant="branded" size={16} />
          USDC · Arc Mainnet
        </span>
      </div>

      <div className="mt-6 min-h-[4.5rem]" data-testid="balance-amount">
        {loading ? (
          <div className="skeleton h-14 w-56" aria-label="Loading balance" />
        ) : failed ? (
          <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold" style={{ color: 'var(--danger)' }}>
            <RefreshCw className="size-4" /> Balance unavailable. Retry
          </button>
        ) : (
          <p className="flex min-w-0 flex-wrap items-baseline">
            <span className="display text-5xl font-bold tabular-nums sm:text-6xl">{whole}</span>
            <span className="display text-3xl font-semibold tabular-nums sm:text-4xl" style={{ color: 'var(--ink-2)' }}>
              {main}
            </span>
            {extra && (
              <span className="display text-xl font-medium tabular-nums" style={{ color: 'var(--subtle)' }}>
                {extra}
              </span>
            )}
            <span className="ml-2 text-base font-semibold" style={{ color: 'var(--subtle)' }}>
              USDC
            </span>
          </p>
        )}
      </div>

      <div className="chip mt-6 w-full justify-between py-1.5 pl-1.5 pr-1.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="size-8 shrink-0 rounded-full" style={{ background: gradient }} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase leading-none tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
              Your wallet
            </span>
            <span className="mono mt-1 block truncate text-sm font-medium tabular-nums" title={address}>
              {shortAddress(address, 8, 6)}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={copied ? 'Address copied' : 'Copy wallet address'}
            className="btn btn-ghost !min-h-11 !gap-1.5 !rounded-full !px-3 text-xs"
          >
            {copied ? <Check className="size-4" style={{ color: 'var(--success)' }} /> : <Copy className="size-4" />}
            <span className="hidden min-[400px]:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <a
            href={buildAddressExplorerUrl(ARC_MAINNET_CHAIN_ID, address)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View wallet on explorer"
            className="btn btn-ghost !min-h-11 !w-11 !rounded-full !px-0"
          >
            <ExternalLink className="size-4" />
          </a>
        </span>
      </div>
    </section>
  )
}
