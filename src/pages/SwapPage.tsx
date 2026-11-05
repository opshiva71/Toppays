import type { useUniswapSwap } from '@/hooks/useUniswapSwap'
import { SwapPanel } from '@/components/SwapPanel'

/** The real Uniswap V3 swap (live quotes, simulation before the wallet) inside the page frame. */
export function SwapPage({ swap }: { swap: ReturnType<typeof useUniswapSwap> }) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <SwapPanel swap={swap} />
    </div>
  )
}
