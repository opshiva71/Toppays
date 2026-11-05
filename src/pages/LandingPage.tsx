import { Loader2, ShieldCheck, Zap, ArrowLeftRight } from 'lucide-react'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Wordmark } from '@/components/Logo'
import { NetworkPill } from '@/components/shell/NetworkPill'

const FEATURES = [
  { Icon: Zap, title: 'Instant USDC', body: 'Send and receive on Arc Mainnet with finality in a block.' },
  { Icon: ArrowLeftRight, title: 'Real swaps', body: 'Live Uniswap V3 quotes, simulated before your wallet is asked.' },
  { Icon: ShieldCheck, title: 'You hold the keys', body: 'Your wallet signs everything. TopPay never sees a key.' },
] as const

/** Shown until a wallet is connected: brand, tagline, wallet picker and the three promises. */
export function LandingPage({ connecting }: { connecting: boolean }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-16 pt-5 lg:px-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        <NetworkPill compact />
      </header>

      <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-2 lg:gap-16 lg:py-16">
        <section aria-label="Welcome to TopPay">
          <p className="label">Premium USDC payments</p>
          <h1 className="display mt-3 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Send. Receive. <span className="text-grad">Move Money.</span>
          </h1>
          <p className="mt-4 max-w-md text-pretty text-base" style={{ color: 'var(--muted)' }}>
            A fast, simple wallet for USDC on Arc Mainnet. Pay anyone, get paid, and swap tokens, all from your own wallet.
          </p>
          <ul className="mt-8 hidden space-y-4 lg:block">
            {FEATURES.map(({ Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="tile-icon !size-10 !rounded-xl shrink-0">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm" style={{ color: 'var(--muted)' }}>
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div>
          {connecting ? (
            <div className="flex justify-center py-24">
              <Loader2 className="size-6 animate-spin" style={{ color: 'var(--subtle)' }} />
            </div>
          ) : (
            <ConnectWallet />
          )}
        </div>
      </div>
    </div>
  )
}
