import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownUp, ChevronDown, Info, Layers, Loader2, RefreshCw, Settings2 } from 'lucide-react'
import { formatUnits } from 'viem'
import { SWAP_SETTINGS } from '../../config/uniswap'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'
import type { useUniswapSwap } from '@/hooks/useUniswapSwap'
import { formatTokenAmount } from '@/services/swapTokens'
import { ContractBadge } from './swap/ContractBadge'
import { SlippageControl } from './swap/SlippageControl'
import { SwapRiskInfo } from './swap/SwapRiskInfo'
import { SwapDetails } from './swap/SwapDetails'
import { SwapStatus } from './swap/SwapStatus'
import { TokenIcon } from './swap/TokenIcon'
import { TokenSelect } from './swap/TokenSelect'

type SwapApi = ReturnType<typeof useUniswapSwap>

interface Cta {
  label: string
  disabled: boolean
  loading?: boolean
  onClick?: () => void
}

export function SwapPanel({ swap }: { swap: SwapApi }) {
  const [payPicker, setPayPicker] = useState(false)
  const [receivePicker, setReceivePicker] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [riskOpen, setRiskOpen] = useState(false)

  const { tokenIn, tokenOut, quote, execution, wallet } = swap
  const symbolIn = tokenIn.symbol
  const symbolOut = tokenOut.symbol

  const cta: Cta = useMemo(() => {
    if (swap.busy) {
      const label = execution.phase === 'pending' ? 'Waiting for confirmation…' : execution.phase === 'approving' ? 'Approve in your wallet…' : 'Confirm in your wallet…'
      return { label, disabled: true, loading: true }
    }
    if (wallet.isWrongNetwork) return { label: 'Switch to Arc Mainnet', disabled: wallet.isSwitching, onClick: wallet.switchToArc }
    if (swap.amountIn === null || swap.amountIn <= 0n) return { label: 'Enter an amount', disabled: true }
    if (swap.insufficientBalance) return { label: `Insufficient ${symbolIn} balance`, disabled: true }
    if (swap.quoteError && !quote) return { label: 'Quote unavailable', disabled: true }
    if (!quote || swap.approvalNeeded === null) return { label: 'Getting best price…', disabled: true, loading: true }
    if (swap.insufficientGas) return { label: 'Not enough USDC for the network fee', disabled: true }
    if (swap.impactBlocked) return { label: 'Confirm the price impact below', disabled: true }
    if (swap.approvalNeeded) return { label: `Approve ${symbolIn}`, disabled: false, onClick: () => void swap.approve() }
    return { label: `Swap ${symbolIn} for ${symbolOut}`, disabled: false, onClick: () => void swap.swap() }
  }, [swap, execution.phase, wallet, quote, symbolIn, symbolOut])

  const canMax = swap.maxAmount !== null && swap.maxAmount > 0n && !swap.busy
  const reserveNote = tokenIn.symbol === 'USDC' ? `Leaves ${formatTokenAmount(swap.gasReserveUsdc, tokenIn, 4)} USDC for the network fee` : undefined

  return (
    <section className="space-y-4" aria-labelledby="swap-title">
      <div className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1">
              <h1 id="swap-title" className="display text-3xl font-bold tracking-tight">
                Swap
              </h1>
              <button
                type="button"
                onClick={() => setRiskOpen(true)}
                aria-label="Swap risks: read before you swap"
                aria-haspopup="dialog"
                className="-my-2 inline-flex size-11 items-center justify-center rounded-full transition-colors hover:bg-[var(--fill-hover)]"
                style={{ color: 'var(--muted)' }}
              >
                <Info className="size-5" />
              </button>
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              Trade tokens on Arc Mainnet through Uniswap.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen((value) => !value)}
            aria-expanded={settingsOpen}
            aria-label="Swap settings"
            className="chip !size-11 shrink-0 justify-center"
            style={settingsOpen ? { borderColor: 'var(--accent)' } : undefined}
          >
            <Settings2 className="size-[18px]" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="badge badge-pending min-h-8 px-3 text-xs">
            <span className="size-1.5 rounded-full" style={{ background: 'var(--success)' }} />
            Arc Mainnet · {ARC_MAINNET_CHAIN_ID}
          </span>
          <span className="badge badge-neutral min-h-8 px-3 text-xs">
            <Layers className="size-3.5" /> Direct on-chain Uniswap
          </span>
        </div>
        <div className="mt-2">
          <ContractBadge />
        </div>

        {settingsOpen && (
          <div className="inner mt-4 p-4">
            <SlippageControl value={swap.slippage} onChange={swap.setSlippage} />
          </div>
        )}
      </div>

      <div className="card space-y-3 p-4 sm:p-5">
        {/* You pay */}
        <div className="inner p-4">
          <div className="flex items-center justify-between">
            <label htmlFor="swap-amount" className="label">
              You pay
            </label>
            <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              Balance {swap.balanceIn === undefined ? '—' : formatTokenAmount(swap.balanceIn, tokenIn, 6)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="swap-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              value={swap.amountText}
              onChange={(event) => swap.setAmount(event.target.value)}
              disabled={swap.busy}
              aria-invalid={swap.insufficientBalance}
              className="display min-w-0 flex-1 bg-transparent text-3xl font-bold tabular-nums outline-none focus:outline-none focus-visible:!outline-none placeholder:text-slate-300 sm:text-4xl"
            />
            <button
              type="button"
              onClick={() => setPayPicker(true)}
              disabled={swap.busy}
              aria-label={`Pay token: ${symbolIn}. Change token`}
              className="chip min-h-11 shrink-0 gap-2 py-1 pl-1.5 pr-3 text-base font-semibold"
            >
              <TokenIcon symbol={symbolIn} size={28} />
              {symbolIn}
              <ChevronDown className="size-4" style={{ color: 'var(--subtle)' }} />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs">
            <span style={{ color: 'var(--subtle)' }}>{tokenIn.name}</span>
            <button
              type="button"
              disabled={!canMax}
              title={reserveNote}
              onClick={() => swap.maxAmount !== null && swap.setAmount(formatUnits(swap.maxAmount, tokenIn.decimals))}
              className="min-h-8 rounded-full px-3 font-semibold disabled:opacity-40"
              style={{ background: 'rgba(96,165,250,0.14)', color: 'var(--accent-hover)' }}
            >
              MAX
            </button>
          </div>
          {swap.insufficientBalance && (
            <p role="alert" className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
              Amount is higher than your {symbolIn} balance.
            </p>
          )}
          {tokenIn.symbol === 'USDC' && reserveNote && (
            <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
              USDC also pays the network fee, so MAX keeps a small reserve. {reserveNote}.
            </p>
          )}
        </div>

        {/* Reverse */}
        <div className="relative z-10 -my-5 flex justify-center">
          <button
            type="button"
            onClick={swap.reverse}
            disabled={swap.busy}
            aria-label="Reverse swap direction"
            className="chip !size-11 justify-center"
            style={{ background: 'var(--surface-strong)', boxShadow: '0 6px 16px -8px rgba(18,45,69,0.35)' }}
          >
            <ArrowDownUp className="size-[18px]" />
          </button>
        </div>

        {/* You receive */}
        <div className="inner p-4">
          <div className="flex items-center justify-between">
            <span className="label">You receive (estimated)</span>
            <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              Balance {swap.balanceOut === undefined ? '—' : formatTokenAmount(swap.balanceOut, tokenOut, 6)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <output
              aria-live="polite"
              aria-label="Estimated amount you receive"
              className="display block min-w-0 flex-1 truncate text-3xl font-bold tabular-nums sm:text-4xl"
              style={{ color: quote ? 'var(--ink)' : 'var(--subtle)' }}
            >
              {quote ? formatTokenAmount(quote.amountOut, tokenOut, 6) : swap.fetching && swap.amountIn ? <Loader2 className="size-6 animate-spin" /> : '0.0'}
            </output>
            <button
              type="button"
              onClick={() => setReceivePicker(true)}
              disabled={swap.busy}
              aria-label={`Receive token: ${symbolOut}. Change token`}
              className="chip min-h-11 shrink-0 gap-2 py-1 pl-1.5 pr-3 text-base font-semibold"
            >
              <TokenIcon symbol={symbolOut} size={28} />
              {symbolOut}
              <ChevronDown className="size-4" style={{ color: 'var(--subtle)' }} />
            </button>
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
            {tokenOut.name}
          </p>
        </div>

        {swap.quoteError && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--danger)' }}>
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {swap.quoteError.message}
            </span>
            {swap.quoteError.kind !== 'no-route' && swap.quoteError.kind !== 'invalid' && (
              <button type="button" className="btn btn-ghost !min-h-8 shrink-0 !px-2 text-xs" onClick={() => void swap.refreshQuote()}>
                <RefreshCw className="size-3.5" /> Retry
              </button>
            )}
          </div>
        )}

        {quote && <SwapDetails quote={quote} refreshing={swap.fetching} />}

        {swap.highImpact && quote && (
          <label className="flex items-start gap-3 rounded-xl p-3 text-sm" style={{ background: 'rgba(248,113,113,0.1)' }}>
            <input
              type="checkbox"
              checked={swap.impactAck}
              onChange={(event) => swap.setImpactAck(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[#f87171]"
            />
            <span>
              This trade has a price impact of <strong>{quote.priceImpact.toFixed(2)}%</strong> (at or above {SWAP_SETTINGS.priceImpactDanger}%). I understand I may receive much less than the market price.
            </span>
          </label>
        )}

        {swap.notice && (
          <p role="status" className="rounded-xl p-3 text-sm" style={{ background: 'rgba(52,211,153,0.1)', color: 'var(--success)' }}>
            {swap.notice}
          </p>
        )}

        {execution.phase === 'idle' && execution.message && (
          <p role="status" className="rounded-xl p-3 text-sm" style={{ background: 'rgba(96,165,250,0.1)' }}>
            {execution.message}
          </p>
        )}

        <SwapStatus execution={execution} tokenOut={tokenOut} onDismiss={swap.dismiss} />

        {execution.phase !== 'confirmed' && (
          <button type="button" className="btn btn-primary w-full" disabled={cta.disabled} onClick={cta.onClick}>
            {cta.loading && <Loader2 className="size-4 animate-spin" />}
            {cta.label}
          </button>
        )}

        {swap.approvalNeeded === true && !swap.busy && quote && (
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            {symbolIn} first needs a one-time approval for the Uniswap SwapRouter02 contract, limited to exactly {formatTokenAmount(quote.params.amountIn, tokenIn, 6)} {symbolIn}. It is never unlimited.
          </p>
        )}
        <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
          Real funds · swaps can't be reversed ·{' '}
          <button type="button" onClick={() => setRiskOpen(true)} className="font-semibold underline underline-offset-2" style={{ color: 'var(--accent-hover)' }}>
            Read the risks
          </button>
        </p>
        <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
          Quotes come straight from Uniswap V3 pools on Arc Mainnet. TOPpay adds no fee, uses no API and no other aggregator.
        </p>
      </div>

      <SwapRiskInfo open={riskOpen} onClose={() => setRiskOpen(false)} />

      <TokenSelect
        open={payPicker}
        title="You pay"
        selected={tokenIn}
        other={tokenOut}
        balances={swap.balances}
        onSelect={swap.selectIn}
        onClose={() => setPayPicker(false)}
      />
      <TokenSelect
        open={receivePicker}
        title="You receive"
        selected={tokenOut}
        other={tokenIn}
        balances={swap.balances}
        onSelect={swap.selectOut}
        onClose={() => setReceivePicker(false)}
      />
    </section>
  )
}
