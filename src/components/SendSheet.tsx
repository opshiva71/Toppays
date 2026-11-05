import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import type { Address } from 'viem'
import { Amount, gasTokenToUsdc } from '@/onchain-money'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'
import { formatNativeAsUsdc, formatUsdcRaw, shortAddress } from '@/lib/format'
import { getFees, sanitizeAmountInput, validateAmount, validateRecipient } from '@/services/send'
import type { useSendUsdc } from '@/hooks/useSendUsdc'
import { SendStatus } from './SendStatus'

interface SendSheetProps {
  sender: Address
  usdcBalance: bigint | undefined
  nativeBalance: bigint | undefined
  isWrongNetwork: boolean
  switching: boolean
  onSwitchNetwork: () => void
  send: ReturnType<typeof useSendUsdc>
  onDone: () => void
}

/** Gas for a plain transfer (21,000) plus the 10% pad used by the quote. */
const TRANSFER_GAS_RESERVE = 23_100n

export function SendSheet({ sender, usdcBalance, nativeBalance, isWrongNetwork, switching, onSwitchNetwork, send, onDone }: SendSheetProps) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState({ recipient: false, amount: false })
  const { state, busy, prepare, confirm, backToEdit } = send

  const { data: fees } = useQuery({ queryKey: ['fees'], queryFn: getFees, refetchInterval: 15_000, staleTime: 10_000 })

  const recipientCheck = useMemo(() => validateRecipient(recipient, sender), [recipient, sender])
  const amountCheck = useMemo(() => validateAmount(amount), [amount])

  const aboveBalance =
    amountCheck.ok && usdcBalance !== undefined && amountCheck.value.raw > usdcBalance
      ? 'Amount is higher than your USDC balance.'
      : null

  const maxAmount = useMemo(() => {
    if (nativeBalance === undefined || !fees) return null
    const spendable = nativeBalance - TRANSFER_GAS_RESERVE * fees.maxFeePerGas
    if (spendable <= 0n) return Amount.zero(6)
    return gasTokenToUsdc(ARC_MAINNET_CHAIN_ID, Amount.fromRaw(spendable, 18), 'trunc')
  }, [nativeBalance, fees])

  const canReview = recipientCheck.ok && amountCheck.ok && !aboveBalance && !busy && !isWrongNetwork

  // Form view.
  if (state.phase === 'idle' || state.phase === 'quoting') {
    return (
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (canReview) void prepare(recipient, amount)
        }}
      >
        <div>
          <label htmlFor="recipient" className="label">
            Recipient
          </label>
          <input
            id="recipient"
            className="field mono mt-1.5 text-base sm:text-sm"
            placeholder="0x…"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value.trim())}
            onBlur={() => setTouched((value) => ({ ...value, recipient: true }))}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={touched.recipient && !recipientCheck.ok && !recipientCheck.empty}
          />
          {touched.recipient && !recipientCheck.ok && !recipientCheck.empty && (
            <p role="alert" className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>
              {recipientCheck.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="amount" className="label">
            Amount
          </label>
          <div className="inner mt-1.5 p-4">
            <input
              id="amount"
              inputMode="decimal"
              className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-600"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
              onBlur={() => setTouched((value) => ({ ...value, amount: true }))}
              autoComplete="off"
              aria-invalid={touched.amount && !amountCheck.ok && !amountCheck.empty}
            />
            <div className="mt-2 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--subtle)' }}>USDC</span>
              <button
                type="button"
                disabled={!maxAmount || maxAmount.isZero()}
                onClick={() => maxAmount && setAmount(maxAmount.toString())}
                className="font-semibold disabled:opacity-40"
                style={{ color: 'var(--accent-hover)' }}
              >
                {usdcBalance !== undefined ? `Balance ${formatUsdcRaw(usdcBalance)} · Max (after fee)` : 'Balance unavailable'}
              </button>
            </div>
          </div>
          {touched.amount && !amountCheck.ok && !amountCheck.empty && (
            <p role="alert" className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>
              {amountCheck.message}
            </p>
          )}
          {aboveBalance && (
            <p role="alert" className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>
              {aboveBalance}
            </p>
          )}
        </div>

        <div className="inner flex items-center justify-between gap-3 px-4 py-3 text-xs">
          <span style={{ color: 'var(--muted)' }}>Estimated network fee</span>
          <span className="font-semibold tabular-nums">
            {fees ? `up to ${formatNativeAsUsdc(TRANSFER_GAS_RESERVE * fees.maxFeePerGas)} USDC` : 'Estimating…'}
          </span>
        </div>

        {state.message && (
          <p role="alert" className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--danger)' }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {state.message}
          </p>
        )}

        {isWrongNetwork ? (
          <button type="button" className="btn btn-primary w-full" onClick={onSwitchNetwork} disabled={switching}>
            {switching ? <Loader2 className="size-4 animate-spin" /> : null} Switch wallet to Arc Mainnet
          </button>
        ) : (
          <button type="submit" className="btn btn-primary w-full" disabled={!canReview}>
            {state.phase === 'quoting' ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Estimating fee…
              </>
            ) : (
              <>
                Review payment <ArrowRight className="size-4" />
              </>
            )}
          </button>
        )}
      </form>
    )
  }

  // Summary before confirmation.
  if (state.phase === 'review' && state.quote) {
    const quote = state.quote
    return (
      <div className="space-y-4">
        <div className="inner space-y-3 p-4 text-sm">
          <Row label="You send">
            <span className="display text-2xl font-bold tabular-nums">{formatUsdcRaw(quote.amount.raw)} USDC</span>
          </Row>
          <Row label="To">
            <span className="mono break-all text-right text-xs">{quote.to}</span>
          </Row>
          <Row label="From">
            <span className="mono text-xs">{shortAddress(quote.from, 8, 6)}</span>
          </Row>
          <Row label="Network fee (max)">
            <span className="tabular-nums">{formatNativeAsUsdc(quote.maxFeeNative)} USDC</span>
          </Row>
          <Row label="Network">
            <span>Arc Mainnet</span>
          </Row>
        </div>

        {quote.recipientIsContract && (
          <p className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--warning)' }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> The recipient is a smart contract. Make sure it can receive USDC, or the transfer may fail.
          </p>
        )}
        {state.message && (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
            {state.message}
          </p>
        )}
        <ol className="inner space-y-2 p-4 text-xs" style={{ color: 'var(--muted)' }} aria-label="What happens next">
          <li className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: 'var(--grad)' }}>1</span>
            Press Confirm in wallet. Your wallet opens a request showing this exact amount and recipient.
          </li>
          <li className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: 'var(--grad)' }}>2</span>
            Check the details there, then approve. Nothing is sent until you do.
          </li>
          <li className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: 'var(--grad)' }}>3</span>
            We show Confirmed only after Arc Mainnet includes the payment. Real USDC; it cannot be reversed.
          </li>
        </ol>

        <div className="grid grid-cols-[auto_1fr] gap-3">
          <button type="button" className="btn btn-secondary" onClick={backToEdit}>
            Back
          </button>
          {isWrongNetwork ? (
            <button type="button" className="btn btn-primary" onClick={onSwitchNetwork} disabled={switching}>
              Switch to Arc Mainnet
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => void confirm()}>
              Confirm in wallet
            </button>
          )}
        </div>
      </div>
    )
  }

  return <SendStatus send={send} onDone={onDone} />
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  )
}
