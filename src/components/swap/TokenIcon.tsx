import { TokenBTC, TokenEURC, TokenUSDC, TokenETH } from '@web3icons/react'

/** Token logo from the Web3Icons set; unknown symbols fall back to a lettered disc. */
export function TokenIcon({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const props = { size, variant: 'branded' as const }
  switch (symbol) {
    case 'USDC':
      return <TokenUSDC {...props} />
    case 'EURC':
      return <TokenEURC {...props} />
    case 'cirBTC':
      return <TokenBTC {...props} />
    case 'WETH':
      return <TokenETH {...props} />
    default:
      return (
        <span
          className="flex items-center justify-center rounded-full text-xs font-bold"
          style={{ width: size, height: size, background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          {symbol.slice(0, 1)}
        </span>
      )
  }
}
