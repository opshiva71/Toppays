import { Amount, formatUnitsExact, gasTokenToUsdc } from '@/onchain-money'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'

export function shortAddress(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`
}

/** Groups the whole part with commas and keeps `minFraction`..`maxFraction` digits (truncated, never rounded up). */
export function formatDecimalString(exact: string, minFraction = 2, maxFraction = 6): string {
  const negative = exact.startsWith('-')
  const [whole, fraction = ''] = (negative ? exact.slice(1) : exact).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const trimmed = fraction.slice(0, maxFraction).padEnd(minFraction, '0')
  return `${negative ? '-' : ''}${trimmed ? `${grouped}.${trimmed}` : grouped}`
}

/** ERC-20 view (6 decimals) raw amount to display text. */
export function formatUsdcRaw(raw: bigint, minFraction = 2): string {
  return formatDecimalString(formatUnitsExact(raw, 6), minFraction, 6)
}

/**
 * Native (18 decimal) raw amount to USDC display text. Truncates below one
 * microdollar and says so instead of showing a misleading zero.
 */
export function formatNativeAsUsdc(raw: bigint, minFraction = 2): string {
  const asUsdc = gasTokenToUsdc(ARC_MAINNET_CHAIN_ID, Amount.fromRaw(raw, 18), 'trunc')
  if (asUsdc.isZero() && raw > 0n) return '<0.000001'
  return formatDecimalString(asUsdc.toString(), minFraction, 6)
}

export function formatDateTime(unixSeconds: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(unixSeconds * 1000))
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

export function formatTime(unixSeconds: number): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(unixSeconds * 1000))
}

/** "Today", "Yesterday" or a short date, in the viewer's time zone. */
export function dayLabel(unixSeconds: number, now: Date = new Date()): string {
  const date = new Date(unixSeconds * 1000)
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' }).format(date)
}

/** Splits a decimal string into the whole part and the fraction for typographic emphasis. */
export function splitDecimal(text: string): { whole: string; fraction: string } {
  const index = text.indexOf('.')
  return index === -1 ? { whole: text, fraction: '' } : { whole: text.slice(0, index), fraction: text.slice(index) }
}
