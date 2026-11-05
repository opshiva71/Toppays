import { useMemo } from 'react'
import { ActivityList, type LocalSend } from '@/components/ActivityList'
import { BalanceCard } from '@/components/BalanceCard'
import { NetworkStatusCard } from '@/components/NetworkStatusCard'
import { QuickActions } from '@/components/QuickActions'
import type { HistoryState } from '@/hooks/useTransactionHistory'
import { shortAddress } from '@/lib/format'

interface DashboardPageProps {
  address: string
  balance: bigint | undefined
  balanceLoading: boolean
  balanceFailed: boolean
  onRetryBalance: () => void
  history: HistoryState
  localSend: LocalSend | null
}

function greeting(): string {
  const hour = new Date().getHours()
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

export function DashboardPage({ address, balance, balanceLoading, balanceFailed, onRetryBalance, history, localSend }: DashboardPageProps) {
  const hello = useMemo(() => greeting(), [])
  return (
    <div className="space-y-4 sm:space-y-5">
      <section aria-label="Welcome" className="px-1">
        <p className="label">{hello}</p>
        <h1 className="display mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          Welcome back<span className="text-grad">.</span>
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          <span className="mono">{shortAddress(address, 6, 4)}</span> is connected to Arc Mainnet. Send. Receive. Move Money.
        </p>
      </section>

      <BalanceCard address={address} balance={balance} loading={balanceLoading} failed={balanceFailed} onRetry={onRetryBalance} />
      <QuickActions />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-3">
          {localSend && (
            <a href="#/activity" className="card flex items-center justify-between gap-3 p-4 text-sm" aria-label="Payment in progress. Open activity">
              <span className="font-semibold">Payment {localSend.status === 'failed' ? 'failed' : 'in progress'}</span>
              <span style={{ color: 'var(--accent-hover)' }}>View</span>
            </a>
          )}
          <ActivityList history={history} variant="compact" />
        </div>
        <NetworkStatusCard />
      </div>
    </div>
  )
}
