import { useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, Repeat2 } from 'lucide-react'
import type { HistoryState } from '@/hooks/useTransactionHistory'
import { formatUnits } from 'viem'
import { formatDateTime, formatNativeAsUsdc } from '@/lib/format'

/** Short display for a card ("604.80", "1.2M"); the exact amount is in the tooltip. Native amounts have 18 decimals. */
function short(raw: bigint): string {
  const value = Number(formatUnits(raw, 18))
  return new Intl.NumberFormat('en-US', value >= 100_000 ? { notation: 'compact', maximumFractionDigits: 1 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

/** Totals computed from the real, loaded transactions only. The caption says exactly how far back that is. */
export function ActivityStats({ history }: { history: HistoryState }) {
  const { entries, loading, oldestScanned, oldestScannedTime } = history
  const totals = useMemo(() => {
    let received = 0n
    let sent = 0n
    for (const entry of entries) {
      if (entry.direction === 'received') received += entry.amountNative
      else sent += entry.amountNative
    }
    return { received, sent, count: entries.length }
  }, [entries])

  const waiting = loading && entries.length === 0
  const caption = oldestScanned === null ? 'Reading the chain…' : oldestScannedTime ? `Since ${formatDateTime(oldestScannedTime)}` : `Since block ${oldestScanned.toString()}`

  const cards = [
    { label: 'Received', value: short(totals.received), exact: formatNativeAsUsdc(totals.received), unit: 'USDC', Icon: ArrowDownLeft, color: 'var(--success)' },
    { label: 'Sent', value: short(totals.sent), exact: formatNativeAsUsdc(totals.sent), unit: 'USDC', Icon: ArrowUpRight, color: 'var(--accent-hover)' },
    { label: 'Payments', value: String(totals.count), exact: String(totals.count), unit: '', Icon: Repeat2, color: 'var(--ink-2)' },
  ] as const

  return (
    <section aria-label="Activity summary">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {cards.map(({ label, value, exact, unit, Icon, color }) => (
          <div key={label} className="card min-w-0 p-3.5 sm:p-4">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--subtle)' }}>
              <Icon className="size-3.5 shrink-0" style={{ color }} aria-hidden="true" />
              {label}
            </span>
            {waiting ? (
              <div className="skeleton mt-2.5 h-6 w-16" aria-label="Loading" />
            ) : (
              <p className="display mt-2 truncate text-base font-bold tabular-nums sm:text-xl" title={`${exact} ${unit}`.trim()}>
                {value}
                {unit && <span className="ml-1 text-[11px] font-medium" style={{ color: 'var(--subtle)' }}>{unit}</span>}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 px-1 text-[11px]" style={{ color: 'var(--subtle)' }}>
        From the transactions loaded so far · {caption}
      </p>
    </section>
  )
}
