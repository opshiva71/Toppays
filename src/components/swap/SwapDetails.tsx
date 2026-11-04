import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { SWAP_SETTINGS } from '../../../config/uniswap'
import { formatNativeAsUsdc } from '@/lib/format'
import { exchangeRate, formatRate, formatTokenAmount } from '@/services/swapTokens'
import { feePercentLabel, routeLabel, type SwapQuoteView } from '@/services/uniswap'

interface SwapDetailsProps {
  quote: SwapQuoteView
  refreshing: boolean
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span title={hint} style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <div className="min-w-0 text-right font-medium tabular-nums">{children}</div>
    </div>
  )
}

/** Rate, minimum received, price impact, pool fee, network fee and route, all computed from the live onchain quote. */
export function SwapDetails({ quote, refreshing }: SwapDetailsProps) {
  const { tokenIn, tokenOut, amountIn, slippage } = quote.params
  const rate = exchangeRate(amountIn, quote.amountOut, tokenIn, tokenOut)
  const [age, setAge] = useState(0)

  useEffect(() => {
    const tick = () => setAge(Math.max(0, Math.floor((Date.now() - quote.fetchedAt) / 1000)))
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [quote.fetchedAt])

  const impact = quote.priceImpact
  const impactColor = impact >= SWAP_SETTINGS.priceImpactDanger ? 'var(--danger)' : impact >= SWAP_SETTINGS.priceImpactWarn ? 'var(--warning)' : 'var(--success)'
  const feeLabel = quote.route.map((hop) => feePercentLabel(hop.pool.fee)).join(' + ')

  return (
    <div className="inner px-4 py-3 text-sm" aria-label="Swap details">
      <Row label="Rate">
        {rate === null ? (
          '—'
        ) : (
          <span>
            1 {tokenIn.symbol} = {formatRate(rate)} {tokenOut.symbol}
          </span>
        )}
      </Row>
      <Row label={`Minimum received (${slippage.toFixed(2)}% slippage)`} hint="The swap reverts onchain if it would pay out less than this">
        {formatTokenAmount(quote.minOut, tokenOut, 6)} {tokenOut.symbol}
      </Row>
      <Row label="Price impact" hint="How much your trade moves the pool price, not counting the pool fee">
        <span style={{ color: impactColor }}>{impact < 0.01 ? '<0.01%' : `${impact.toFixed(2)}%`}</span>
      </Row>
      <Row label="Pool fee" hint="Paid to liquidity providers. TOPpay adds no fee.">
        {feeLabel}
      </Row>
      <Row label="Network fee" hint="Estimated from the quoter's gas figure; replaced by a real estimate before you sign">
        {quote.gasFeeWei > 0n ? `≈ ${formatNativeAsUsdc(quote.gasFeeWei, 2)} USDC` : 'Estimated at confirmation'}
      </Row>
      <Row label="Route" hint="The Uniswap V3 pool(s) used for this trade">
        <span>
          <span className="font-semibold">V3</span> · {routeLabel(quote.route)}
        </span>
      </Row>
      <Row label="Liquidity" hint="Pools with liquidity found for this pair">
        {quote.poolsConsidered} {quote.poolsConsidered === 1 ? 'pool' : 'pools'} checked
        {quote.alternatives.length > 0 && (
          <span className="mt-0.5 block text-xs font-normal" style={{ color: 'var(--subtle)' }}>
            Next best: {quote.alternatives[0]?.label}
          </span>
        )}
      </Row>
      <Row label="Deadline" hint="The swap reverts onchain if it is mined after this">
        {SWAP_SETTINGS.deadlineSeconds / 60} minutes
      </Row>
      <div className="mt-1 flex items-center justify-between border-t pt-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--subtle)' }}>
        <span className="flex items-center gap-1.5">
          {refreshing && <Loader2 className="size-3 animate-spin" />}
          {refreshing ? 'Refreshing quote' : `Quote updated ${age}s ago`}
        </span>
        <span>Refreshes every {SWAP_SETTINGS.quoteRefreshMs / 1000}s</span>
      </div>
    </div>
  )
}
