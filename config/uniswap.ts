/**
 * Direct Uniswap V3 on Arc Mainnet: addresses, tokens and safety limits for the Swap feature.
 *
 * TopPay deploys nothing and routes through no custom contract. Quotes come from Uniswap's own
 * QuoterV2 and swaps execute on Uniswap's own SwapRouter02, both on Arc Mainnet, read and sent
 * over the normal Arc RPC and signed by the user's wallet. No Uniswap API and no API key.
 */
import { getAddress, type Address } from 'viem'
import { ARC_MAINNET_CHAIN_ID } from './network'
import { SWAP_TOKEN_DEFS, UNISWAP_V3_DEFS, V3_FEE_TIERS } from './uniswap-constants'

export { V3_FEE_TIERS }

/** Chain the Swap feature is allowed to use. */
export const SWAP_CHAIN_ID = ARC_MAINNET_CHAIN_ID

export const UNISWAP_V3: { factory: Address; swapRouter02: Address; quoterV2: Address } = {
  factory: getAddress(UNISWAP_V3_DEFS.factory),
  swapRouter02: getAddress(UNISWAP_V3_DEFS.swapRouter02),
  quoterV2: getAddress(UNISWAP_V3_DEFS.quoterV2),
}

export interface SwapTokenConfig {
  symbol: string
  name: string
  address: Address
  decimals: number
}

/**
 * Tokens offered in Swap. Addresses come from Arc's contract address reference and are re-checked
 * onchain (symbol and decimals) before the screen shows them as verified. Native USDC and the
 * USDC ERC-20 at 0x3600... are the same asset on Arc, so USDC appears once.
 */
export const SWAP_TOKENS: readonly SwapTokenConfig[] = SWAP_TOKEN_DEFS.map((token) => ({
  symbol: token.symbol,
  name: token.name,
  address: getAddress(token.address),
  decimals: token.decimals,
}))

/** Intermediate tokens tried for two-hop routes. Every Arc V3 pool pairs with USDC, and WETH/cirBTC has its own pool. */
export const ROUTING_HUBS: readonly string[] = ['USDC', 'WETH']

export const SWAP_SETTINGS = {
  defaultSlippage: 0.5,
  minSlippage: 0.01,
  maxSlippage: 50,
  slippagePresets: [0.1, 0.5, 1] as readonly number[],
  /** At or above this slippage a warning is shown. */
  highSlippage: 5,
  /** Price impact (percent) that shows a warning, and the level that needs an explicit tick-box. */
  priceImpactWarn: 1,
  priceImpactDanger: 5,
  quoteDebounceMs: 500,
  quoteRefreshMs: 15_000,
  /** A quote older than this is refreshed before the user can sign. */
  quoteMaxAgeMs: 30_000,
  /** The transaction reverts onchain if it is not mined within this many seconds. */
  deadlineSeconds: 20 * 60,
  /** Hard ceiling on gas for a swap or approval; anything above is blocked. */
  maxGasLimit: 1_500_000n,
  /** USDC kept back by MAX (on top of the quoted fee) and used when no quote exists yet. */
  gasReserveBufferUsdc: '0.01',
  fallbackGasReserveUsdc: '0.05',
  /** Extra gas the router needs on top of the quoter's pool-math estimate (transfers, multicall). */
  gasOverhead: 120_000n,
} as const
