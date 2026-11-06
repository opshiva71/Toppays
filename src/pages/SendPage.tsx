import type { Address } from 'viem'
import { TokenUSDC } from '@web3icons/react'
import { formatUsdcRaw } from '@/lib/format'
import type { useSendUsdc } from '@/hooks/useSendUsdc'
import { SendSheet } from '@/components/SendSheet'

interface SendPageProps {
  sender: Address
  usdcBalance: bigint | undefined
  nativeBalance: bigint | undefined
  isWrongNetwork: boolean
  switching: boolean
  onSwitchNetwork: () => void
  send: ReturnType<typeof useSendUsdc>
  onDone: () => void
}

/** The existing, unchanged send flow (validation, review, wallet confirmation, receipt tracking) inside the premium page frame. */
export function SendPage(props: SendPageProps) {
  const { usdcBalance, send } = props
  const showHeader = send.state.phase === 'idle' || send.state.phase === 'quoting'
  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      {showHeader && (
        <section className="card flex items-center justify-between gap-3 px-5 py-4" aria-label="Available balance">
          <div>
            <span className="label">Available balance</span>
            <p className="display mt-1 text-2xl font-bold tabular-nums">{usdcBalance === undefined ? '…' : formatUsdcRaw(usdcBalance)}</p>
          </div>
          <span className="chip shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-semibold">
            <TokenUSDC variant="branded" size={16} /> USDC · Arc Mainnet
          </span>
        </section>
      )}
      <section className="card p-5 sm:p-6" aria-label="Send USDC">
        <SendSheet {...props} />
      </section>
    </div>
  )
}
