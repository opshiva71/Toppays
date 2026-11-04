import { Check } from 'lucide-react'
import { SWAP_TOKENS, type SwapTokenConfig } from '../../../config/uniswap'
import { formatTokenAmount } from '@/services/swapTokens'
import { Sheet } from '../Sheet'
import { TokenIcon } from './TokenIcon'

interface TokenSelectProps {
  open: boolean
  title: string
  selected: SwapTokenConfig
  other: SwapTokenConfig
  balances: Record<string, bigint> | undefined
  onSelect: (token: SwapTokenConfig) => void
  onClose: () => void
}

/** Modal list of the supported tokens with live balances. Picking the other side's token swaps the sides. */
export function TokenSelect({ open, title, selected, other, balances, onSelect, onClose }: TokenSelectProps) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <ul className="space-y-1.5" aria-label="Tokens">
        {SWAP_TOKENS.map((token) => {
          const balance = balances?.[token.symbol]
          const isSelected = token.address === selected.address
          return (
            <li key={token.address}>
              <button
                type="button"
                onClick={() => {
                  onSelect(token)
                  onClose()
                }}
                aria-pressed={isSelected}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/70"
                style={isSelected ? { background: 'rgba(16,97,166,0.08)' } : undefined}
              >
                <TokenIcon symbol={token.symbol} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="display block text-base font-semibold">{token.symbol}</span>
                  <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                    {token.name}
                    {token.address === other.address ? ' · other side' : ''}
                  </span>
                </span>
                <span className="text-right text-sm tabular-nums" style={{ color: 'var(--ink-2)' }}>
                  {balance === undefined ? '—' : formatTokenAmount(balance, token, 6)}
                </span>
                {isSelected && <Check className="size-4" style={{ color: 'var(--accent-hover)' }} aria-label="Selected" />}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs" style={{ color: 'var(--subtle)' }}>
        Only tokens with live Uniswap pools on Arc Mainnet that TOPpay has checked onchain are listed.
      </p>
    </Sheet>
  )
}
