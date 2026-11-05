import { useState } from 'react'
import { ArrowDownUp, ChevronDown, Clock, Coins, Construction, Check, Circle } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { Sheet } from '@/components/Sheet'
import { sanitizeAmountInput } from '@/services/send'

interface BridgeNetwork {
  id: string
  name: string
  chainId: number
  /** Brand-neutral gradient for the monogram. These are labels, not logos. */
  hue: [number, number]
}

/** Public chain IDs of the networks a USDC bridge will connect to Arc. Listing them is not a claim that a route exists yet. */
const NETWORKS: readonly BridgeNetwork[] = [
  { id: 'arc', name: 'Arc Mainnet', chainId: 5042, hue: [217, 262] },
  { id: 'ethereum', name: 'Ethereum', chainId: 1, hue: [230, 250] },
  { id: 'base', name: 'Base', chainId: 8453, hue: [221, 200] },
  { id: 'arbitrum', name: 'Arbitrum One', chainId: 42161, hue: [205, 225] },
  { id: 'optimism', name: 'OP Mainnet', chainId: 10, hue: [350, 330] },
  { id: 'polygon', name: 'Polygon', chainId: 137, hue: [270, 290] },
  { id: 'avalanche', name: 'Avalanche', chainId: 43114, hue: [355, 15] },
]

const STEPS = ['Choose route', 'Approve USDC', 'Send from source', 'Network confirmation', 'Receive on destination'] as const

function Monogram({ network, size = 40 }: { network: BridgeNetwork; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-2xl font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(135deg, hsl(${network.hue[0]} 80% 58%), hsl(${network.hue[1]} 78% 46%))` }}
      aria-hidden="true"
    >
      {network.name.slice(0, 1)}
    </span>
  )
}

/**
 * Bridge screen, ready for a real integration. Nothing here is simulated: there are no quotes, fees,
 * arrival times or transactions until a real bridge is connected, so those fields say so.
 */
export function BridgePage() {
  const [from, setFrom] = useState<BridgeNetwork>(NETWORKS[2])
  const [to, setTo] = useState<BridgeNetwork>(NETWORKS[0])
  const [amount, setAmount] = useState('')
  const [picker, setPicker] = useState<'from' | 'to' | null>(null)

  const choose = (network: BridgeNetwork) => {
    if (picker === 'from') {
      setFrom(network)
      if (network.id === to.id) setTo(from)
    } else if (picker === 'to') {
      setTo(network)
      if (network.id === from.id) setFrom(to)
    }
    setPicker(null)
  }

  const flip = () => {
    setFrom(to)
    setTo(from)
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <section className="card p-5 sm:p-6" aria-labelledby="bridge-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="bridge-title" className="display text-xl font-bold tracking-tight">
              Cross-chain transfer
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              Move USDC between Arc and other networks.
            </p>
          </div>
          <span className="badge badge-warning !px-3 !py-1">
            <Construction className="size-3.5" /> Coming soon
          </span>
        </div>

        <p className="mt-4 rounded-xl p-3 text-xs leading-relaxed" role="note" style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--warning)' }}>
          The bridge is not connected yet. TopPay will not show quotes or move funds until a real bridge integration is live. You can preview the screen below.
        </p>

        <div className="mt-5 space-y-2">
          <NetworkCard label="From" network={from} onClick={() => setPicker('from')} />
          <div className="flex justify-center">
            <button type="button" onClick={flip} aria-label="Swap source and destination networks" className="btn btn-secondary !min-h-11 !w-11 !rounded-full !px-0">
              <ArrowDownUp className="size-4" />
            </button>
          </div>
          <NetworkCard label="To" network={to} onClick={() => setPicker('to')} />
        </div>

        <div className="inner mt-4 p-4">
          <div className="flex items-center justify-between">
            <label htmlFor="bridge-amount" className="label">
              Amount
            </label>
            <span className="chip px-3 py-1.5 text-sm font-semibold" aria-label="Token: USDC">
              <TokenUSDC variant="branded" size={18} /> USDC
            </span>
          </div>
          <input
            id="bridge-amount"
            inputMode="decimal"
            className="display mt-2 w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-600 focus-visible:!outline-none"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
            autoComplete="off"
          />
          <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
            USDC is the first supported token. More tokens will appear here when routes exist.
          </p>
        </div>

        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
              <Coins className="size-4" /> Estimated bridge fee
            </dt>
            <dd style={{ color: 'var(--subtle)' }}>Shown when bridging launches</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
              <Clock className="size-4" /> Estimated arrival
            </dt>
            <dd style={{ color: 'var(--subtle)' }}>Shown when bridging launches</dd>
          </div>
        </dl>

        <button type="button" className="btn btn-primary mt-5 w-full" disabled>
          Bridge coming soon
        </button>
      </section>

      <section className="card p-5" aria-label="Bridge transaction status">
        <div className="flex items-center justify-between">
          <h2 className="display text-lg font-semibold">Transaction status</h2>
          <span className="badge badge-neutral">No transfer</span>
        </div>
        <ol className="mt-4 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3 text-sm" style={{ color: 'var(--subtle)' }}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: 'var(--border)' }}>
                {index === 0 ? <Circle className="size-2.5" /> : <span className="text-[11px] font-semibold">{index + 1}</span>}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-4 flex items-start gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
          <Check className="mt-0.5 size-3.5 shrink-0" /> Live status will appear here from the real bridge once it is connected. Nothing on this page is a real transfer.
        </p>
      </section>

      <Sheet open={picker !== null} title={picker === 'from' ? 'From network' : 'To network'} onClose={() => setPicker(null)}>
        <ul className="grid gap-2 pb-5">
          {NETWORKS.map((network) => {
            const selected = (picker === 'from' ? from : to).id === network.id
            return (
              <li key={network.id}>
                <button
                  type="button"
                  onClick={() => choose(network)}
                  aria-pressed={selected}
                  className="inner flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.07]"
                  style={selected ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' } : undefined}
                >
                  <Monogram network={network} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{network.name}</span>
                    <span className="block text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
                      Chain ID {network.chainId}
                    </span>
                  </span>
                  {selected && <Check className="size-4" style={{ color: 'var(--accent-hover)' }} />}
                </button>
              </li>
            )
          })}
        </ul>
      </Sheet>
    </div>
  )
}

function NetworkCard({ label, network, onClick }: { label: string; network: BridgeNetwork; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} network: ${network.name}. Change`}
      className="inner flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.07]"
    >
      <Monogram network={network} size={44} />
      <span className="min-w-0 flex-1">
        <span className="label">{label}</span>
        <span className="mt-0.5 block text-base font-semibold">{network.name}</span>
        <span className="block text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
          Chain ID {network.chainId}
        </span>
      </span>
      <ChevronDown className="size-5 shrink-0" style={{ color: 'var(--subtle)' }} />
    </button>
  )
}
