import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, History, Loader2, RefreshCw } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'
import { dayLabel, formatDateTime, formatNativeAsUsdc, formatTime, shortAddress } from '@/lib/format'
import type { HistoryState } from '@/hooks/useTransactionHistory'
import type { HistoryEntry } from '@/services/history'
import { StatusBadge } from './StatusBadge'

const PAGE_SIZE = 25
type Filter = 'all' | 'received' | 'sent'

interface Group {
  label: string
  items: HistoryEntry[]
}

function groupByDay(entries: HistoryEntry[]): Group[] {
  const groups: Group[] = []
  for (const entry of entries) {
    const label = entry.timestamp ? dayLabel(entry.timestamp) : 'Recent'
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(entry)
    else groups.push({ label, items: [entry] })
  }
  return groups
}

export function TransactionList({ history }: { history: HistoryState }) {
  const { entries, loading, scanning, error, oldestScanned, oldestScannedTime, reachedGenesis, scanOlder, retry } = history
  const [filter, setFilter] = useState<Filter>('all')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const filtered = useMemo(() => (filter === 'all' ? entries : entries.filter((entry) => entry.direction === filter)), [entries, filter])
  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible])
  const groups = useMemo(() => groupByDay(shown), [shown])

  const changeFilter = (next: Filter) => {
    setFilter(next)
    setVisible(PAGE_SIZE)
  }

  return (
    <section className="card p-4 sm:p-6" aria-labelledby="activity-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <h2 id="activity-title" className="display text-xl font-semibold">
            Recent activity
          </h2>
          {scanning && !loading && (
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--subtle)' }}>
              <Loader2 className="size-3.5 animate-spin" /> Scanning
            </span>
          )}
        </div>
        <div className="segmented" role="group" aria-label="Filter transactions">
          {(['all', 'received', 'sent'] as const).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => changeFilter(value)}>
              {value === 'all' ? 'All' : value === 'received' ? 'Received' : 'Sent'}
            </button>
          ))}
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <div className="space-y-2" aria-label="Loading transactions">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="skeleton h-[68px] w-full !rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="inner flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-white">
            <History className="size-5" style={{ color: 'var(--subtle)' }} />
          </span>
          <p className="text-sm font-semibold">
            {entries.length === 0 ? 'No transactions found yet' : `No ${filter} transactions in the loaded range`}
          </p>
          <p className="max-w-xs text-pretty text-xs" style={{ color: 'var(--muted)' }}>
            {entries.length === 0
              ? oldestScanned !== null
                ? `Scanned back to block ${oldestScanned.toString()}${oldestScannedTime ? ` (${formatDateTime(oldestScannedTime)})` : ''}. New payments appear here automatically.`
                : 'Activity is read directly from Arc Mainnet.'
              : 'Try another filter or scan older blocks.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="label px-1 pb-1.5">{group.label}</h3>
              <ul className="space-y-1">
                {group.items.map((entry) => (
                  <Row key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {filtered.length > visible && (
        <button type="button" className="btn btn-secondary mt-4 w-full" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
          Show more ({filtered.length - visible} more loaded)
        </button>
      )}

      {error && (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-2xl p-3 text-xs" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
          <span>{error}</span>
          <button type="button" onClick={retry} className="inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold">
            <RefreshCw className="size-3.5" /> Retry
          </button>
        </div>
      )}

      {!loading && (
        <div className="mt-4 flex flex-col items-start justify-between gap-3 border-t px-1 pt-4 sm:flex-row sm:items-center" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            {reachedGenesis
              ? 'Full history scanned.'
              : oldestScanned !== null
                ? `Scanned back to block ${oldestScanned.toString()}${oldestScannedTime ? ` · ${formatDateTime(oldestScannedTime)}` : ''}`
                : ''}
          </p>
          {!reachedGenesis && oldestScanned !== null && (
            <button type="button" className="btn btn-secondary !min-h-11" onClick={scanOlder} disabled={scanning}>
              {scanning ? <Loader2 className="size-4 animate-spin" /> : null} Scan older blocks
            </button>
          )}
        </div>
      )}
      <p className="mt-3 px-1 text-[11px]" style={{ color: 'var(--subtle)' }}>
        Read live from Arc Mainnet logs. Transactions that reverted do not appear.
      </p>
    </section>
  )
}

function Row({ entry }: { entry: HistoryEntry }) {
  const received = entry.direction === 'received'
  const amount = formatNativeAsUsdc(entry.amountNative)
  const url = buildTxExplorerUrl(ARC_MAINNET_CHAIN_ID, entry.txHash)

  return (
    <li>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${received ? 'Received' : 'Sent'} ${amount} USDC ${received ? 'from' : 'to'} ${entry.counterparty}. Open transaction on the explorer`}
        className="group grid min-h-[68px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-white/80"
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-full"
          style={{ background: received ? 'rgba(26,128,71,0.12)' : 'rgba(18,45,69,0.08)' }}
        >
          {received ? (
            <ArrowDownLeft className="size-5" style={{ color: 'var(--success)' }} />
          ) : (
            <ArrowUpRight className="size-5" style={{ color: 'var(--ink)' }} />
          )}
        </span>

        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold">{received ? 'Received' : 'Sent'}</span>
            <StatusBadge status={entry.status} />
          </span>
          <span className="mt-0.5 block text-xs leading-5" style={{ color: 'var(--muted)' }}>
            <span className="mono" title={entry.counterparty}>
              {received ? 'from' : 'to'} {shortAddress(entry.counterparty)}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">{entry.timestamp ? formatTime(entry.timestamp) : `Block ${entry.blockNumber.toString()}`}</span>
          </span>
        </span>

        <span className="text-right">
          <span className="block text-[15px] font-semibold tabular-nums" style={{ color: received ? 'var(--success)' : 'var(--ink)' }}>
            {received ? '+' : '-'}
            {amount}
          </span>
          <span className="mono mt-0.5 inline-flex items-center gap-1 text-[11px] group-hover:underline" style={{ color: 'var(--subtle)' }} title={entry.txHash}>
            {shortAddress(entry.txHash, 6, 4)} <ExternalLink className="size-3" aria-hidden="true" />
          </span>
        </span>
      </a>
    </li>
  )
}
