import { ShieldCheck, Zap } from 'lucide-react'
import { ActivityList, type LocalSend } from '@/components/ActivityList'
import { ActivityStats } from '@/components/ActivityStats'
import { BalanceCard } from '@/components/BalanceCard'
import { NetworkStatusCard } from '@/components/NetworkStatusCard'
import { QuickActions } from '@/components/QuickActions'
import type { HistoryState } from '@/hooks/useTransactionHistory'

interface DashboardPageProps {
  address: string
  balance: bigint | undefined
  balanceLoading: boolean
  balanceFailed: boolean
  onRetryBalance: () => void
  history: HistoryState
  localSend: LocalSend | null
}

export function DashboardPage({ address, balance, balanceLoading, balanceFailed, onRetryBalance, history, localSend }: DashboardPageProps) {
  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <h1 className="sr-only">Dashboard</h1>

      <div className="min-w-0 space-y-4 sm:space-y-5">
        <BalanceCard address={address} balance={balance} loading={balanceLoading} failed={balanceFailed} onRetry={onRetryBalance} />
        <QuickActions />

        {/* On phones the summary sits between the actions and the activity; on desktop it moves to the side column. */}
        <div className="lg:hidden">
          <ActivityStats history={history} />
        </div>

        {localSend && (
          <a href="#/activity" className="card flex items-center justify-between gap-3 p-4 text-sm" aria-label="Payment in progress. Open activity">
            <span className="font-semibold">Payment {localSend.status === 'failed' ? 'failed' : 'in progress'}</span>
            <span style={{ color: 'var(--accent-hover)' }}>View</span>
          </a>
        )}

        <ActivityList history={history} variant="compact" />
      </div>

      <aside className="min-w-0 space-y-4 sm:space-y-5 lg:sticky lg:top-24" aria-label="Summary">
        <div className="hidden lg:block">
          <ActivityStats history={history} />
        </div>
        <NetworkStatusCard />
        <section className="card p-5" aria-label="How TopPay protects you">
          <h2 className="display text-lg font-semibold">Built to be safe</h2>
          <ul className="mt-3 space-y-3 text-sm" style={{ color: 'var(--ink-2)' }}>
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--success)' }} aria-hidden="true" />
              You hold the keys. Your wallet approves every payment and swap.
            </li>
            <li className="flex gap-2.5">
              <Zap className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent-hover)' }} aria-hidden="true" />
              Payments are final once Arc includes them in a block.
            </li>
          </ul>
        </section>
      </aside>
    </div>
  )
}
