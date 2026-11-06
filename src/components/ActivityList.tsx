import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, Copy, ExternalLink, History, Loader2, RefreshCw, Search } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'
import { copyText, dayLabel, formatDateTime, formatNativeAsUsdc, formatTime, shortAddress } from '@/lib/format'
import type { HistoryState } from '@/hooks/useTransactionHistory'
import type { HistoryEntry } from '@/services/history'
import { StatusBadge, type BadgeStatus } from './StatusBadge'

const PAGE_SIZE = 25
type Filter = 'all' | 'received' | 'sent'

/** A payment made from this app in this session that the chain has not finished (or failed). Real wallet and chain state only. */
export interface LocalSend {
  status: BadgeStatus
  amount: string
  to: string
  hash?: string
  message?: string
}

interface ActivityListProps {
  history: HistoryState
  /** compact = dashboard preview (5 rows, link to the full page); full = Activity page (search, filters, copy, explorer). */
  variant: 'compact' | 'full'
  localSend?: LocalSend | null
}

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

function matches(entry: HistoryEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    entry.txHash.toLowerCase().includes(q) ||
    entry.counterparty.toLowerCase().includes(q) ||
    formatNativeAsUsdc(entry.amountNative).includes(q) ||
    entry.direction.includes(q)
  )
}

export function ActivityList({ history, variant, localSend }: ActivityListProps) {
  const { entries, loading, scanning, error, oldestScanned, oldestScannedTime, reachedGenesis, scanOlder, retry } = history
  const full = variant === 'full'
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const filtered = useMemo(
    () => entries.filter((entry) => (filter === 'all' || entry.direction === filter) && (!full || matches(entry, query))),
    [entries, filter, query, full],
  )
  const shown = useMemo(() => filtered.slice(0, full ? visible : 5), [filtered, visible, full])
  const groups = useMemo(() => (full ? groupByDay(shown) : [{ label: '', items: shown }]), [shown, full])

  const empty = filtered.length === 0
  const filtering = filter !== 'all' || query.trim() !== ''

  return (
    <section className={full ? 'space-y-4' : 'card p-4 sm:p-5'} aria-labelledby={`activity-${variant}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <h2 id={`activity-${variant}-title`} className="display text-lg font-semibold sm:text-xl">
            {full ? 'All transactions' : 'Recent activity'}
          </h2>
          {scanning && !loading && (
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--subtle)' }}>
              <Loader2 className="size-3.5 animate-spin" /> Scanning
            </span>
          )}
        </div>
        {full ? (
          <div className="segmented" role="group" aria-label="Filter transactions">
            {(['all', 'received', 'sent'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value)
                  setVisible(PAGE_SIZE)
                }}
              >
                {value === 'all' ? 'All' : value === 'received' ? 'Received' : 'Sent'}
              </button>
            ))}
          </div>
        ) : (
          <a href="#/activity" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
            View all <ArrowRight className="size-3.5" />
          </a>
        )}
      </div>

      {full && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2" style={{ color: 'var(--subtle)' }} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setVisible(PAGE_SIZE)
            }}
            placeholder="Search by address, hash or amount"
            aria-label="Search transactions"
            className="field !pl-10 text-base sm:text-sm"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      {localSend && <LocalSendCard item={localSend} />}

      <div className={full ? 'card p-3 sm:p-4' : 'mt-3'}>
        {loading && entries.length === 0 ? (
          <div className="space-y-2" aria-label="Loading transactions">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="skeleton h-[72px] w-full !rounded-2xl" />
            ))}
          </div>
        ) : empty ? (
          <EmptyState searching={filtering} noneLoaded={entries.length === 0} oldestScanned={oldestScanned} oldestTime={oldestScannedTime} />
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.label || 'all'}>
                {group.label && <h3 className="label px-1 pb-1.5">{group.label}</h3>}
                <ul className="space-y-1.5">
                  {group.items.map((entry, index) => (
                    <TxRow key={entry.id} entry={entry} full={full} index={index} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {full && filtered.length > visible && (
          <button type="button" className="btn btn-secondary mt-4 w-full" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
            Show more ({filtered.length - visible} more loaded)
          </button>
        )}

        {error && (
          <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-2xl p-3 text-xs" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--danger)' }}>
            <span>{error}</span>
            <button type="button" onClick={retry} className="inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold">
              <RefreshCw className="size-3.5" /> Retry
            </button>
          </div>
        )}

        {full && !loading && (
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
      </div>

      {full && (
        <p className="px-1 text-[11px]" style={{ color: 'var(--subtle)' }}>
          Read live from Arc Mainnet logs, never generated. Included payments are final. Transactions that reverted do not appear in the logs.
        </p>
      )}
    </section>
  )
}

function EmptyState({ searching, noneLoaded, oldestScanned, oldestTime }: { searching: boolean; noneLoaded: boolean; oldestScanned: bigint | null; oldestTime: number | null }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="relative flex size-16 items-center justify-center rounded-3xl" style={{ background: 'var(--grad)', boxShadow: '0 18px 36px -16px rgba(124,58,237,0.8)' }}>
        <History className="size-7 text-white" aria-hidden="true" />
      </span>
      <p className="display text-lg font-semibold">{searching && !noneLoaded ? 'Nothing matches' : 'No transactions yet'}</p>
      <p className="max-w-xs text-pretty text-xs" style={{ color: 'var(--muted)' }}>
        {searching && !noneLoaded
          ? 'Try a different search or filter, or scan older blocks.'
          : oldestScanned !== null
            ? `Scanned back to block ${oldestScanned.toString()}${oldestTime ? ` (${formatDateTime(oldestTime)})` : ''}. New payments appear here automatically.`
            : 'Activity is read directly from Arc Mainnet.'}
      </p>
    </div>
  )
}

function TxRow({ entry, full, index }: { entry: HistoryEntry; full: boolean; index: number }) {
  const reduce = useReducedMotion()
  const [copied, setCopied] = useState(false)
  const received = entry.direction === 'received'
  const amount = formatNativeAsUsdc(entry.amountNative)
  const url = buildTxExplorerUrl(ARC_MAINNET_CHAIN_ID, entry.txHash)
  const when = entry.timestamp ? (full ? formatDateTime(entry.timestamp) : formatTime(entry.timestamp)) : `Block ${entry.blockNumber.toString()}`

  const copyHash = async () => {
    if (await copyText(entry.txHash)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const icon = (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
      style={{ background: received ? 'rgba(52,211,153,0.14)' : 'rgba(96,165,250,0.14)' }}
    >
      {received ? <ArrowDownLeft className="size-5" style={{ color: 'var(--success)' }} /> : <ArrowUpRight className="size-5" style={{ color: 'var(--accent-hover)' }} />}
    </span>
  )
  const amountNode = (
    <span className="block text-[15px] font-semibold tabular-nums" style={{ color: received ? 'var(--success)' : 'var(--ink)' }}>
      {received ? '+' : '-'}
      {amount}
      <span className="ml-1 text-xs font-medium" style={{ color: 'var(--subtle)' }}>
        USDC
      </span>
    </span>
  )

  if (!full) {
    return (
      <li>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${received ? 'Received' : 'Sent'} ${amount} USDC ${received ? 'from' : 'to'} ${entry.counterparty}. Open transaction on the explorer`}
          className="group grid min-h-[68px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-[var(--fill)]"
        >
          {icon}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="text-sm font-semibold">{received ? 'Received' : 'Sent'}</span>
              <StatusBadge status={entry.status} />
            </span>
            <span className="mt-0.5 block truncate text-xs" style={{ color: 'var(--muted)' }}>
              <span className="mono">
                {received ? 'from' : 'to'} {shortAddress(entry.counterparty)}
              </span>{' '}
              · {when}
            </span>
          </span>
          <span className="text-right">{amountNode}</span>
        </a>
      </li>
    )
  }

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.025 }}
      className="inner p-3.5"
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        {icon}
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold">{received ? 'Received' : 'Sent'}</span>
            <StatusBadge status={entry.status} />
          </span>
          <span className="mono mt-0.5 block truncate text-xs" style={{ color: 'var(--muted)' }} title={entry.counterparty}>
            {received ? 'from' : 'to'} {shortAddress(entry.counterparty, 8, 6)}
          </span>
        </span>
        <span className="text-right">
          {amountNode}
          <span className="mt-0.5 block text-[11px] tabular-nums" style={{ color: 'var(--subtle)' }}>
            {when}
          </span>
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
        <span className="mono min-w-0 truncate text-[11px]" style={{ color: 'var(--subtle)' }} title={entry.txHash}>
          {shortAddress(entry.txHash, 10, 8)}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => void copyHash()} aria-label={copied ? 'Transaction hash copied' : 'Copy transaction hash'} className="btn btn-secondary !min-h-11 !gap-1.5 !rounded-xl !px-3 text-xs">
            {copied ? <Check className="size-3.5" style={{ color: 'var(--success)' }} /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="View transaction on Arc Explorer" className="btn btn-secondary !min-h-11 !gap-1.5 !rounded-xl !px-3 text-xs">
            Explorer <ExternalLink className="size-3.5" />
          </a>
        </span>
      </div>
    </motion.li>
  )
}

function LocalSendCard({ item }: { item: LocalSend }) {
  const [copied, setCopied] = useState(false)
  const url = item.hash ? buildTxExplorerUrl(ARC_MAINNET_CHAIN_ID, item.hash) : null
  return (
    <div className="card p-4" role="status" aria-label="Payment sent from this app">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Sent {item.amount} USDC</p>
          <p className="mono mt-0.5 truncate text-xs" style={{ color: 'var(--muted)' }}>
            to {shortAddress(item.to, 8, 6)}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      {item.message && (
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          {item.message}
        </p>
      )}
      {item.hash && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
          <span className="mono min-w-0 truncate text-[11px]" style={{ color: 'var(--subtle)' }}>
            {shortAddress(item.hash, 10, 8)}
          </span>
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              className="btn btn-secondary !min-h-11 !gap-1.5 !rounded-xl !px-3 text-xs"
              onClick={() => {
                void copyText(item.hash ?? '').then((ok) => {
                  if (!ok) return
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? 'Copied' : 'Copy'}
            </button>
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary !min-h-11 !gap-1.5 !rounded-xl !px-3 text-xs">
                Explorer <ExternalLink className="size-3.5" />
              </a>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
