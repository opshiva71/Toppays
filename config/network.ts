/**
 * Arc Mainnet network configuration. This is the ONLY place that defines the
 * production chain, RPC endpoints, explorer and USDC facts.
 *
 * Chain facts come from the generated registry (`src/onchain-facts.ts`), never
 * from hand-typed values. RPC endpoints can be overridden per environment:
 *
 *   VITE_ARC_RPC_URL            primary RPC (https only), tried before the official one
 *   VITE_ARC_RPC_FALLBACK_URLS  comma separated extra RPCs (https only), tried last
 */

import { defineChain, type Address } from 'viem'
import { getUsdc, requireChain } from '../src/onchain-facts'

export const ARC_MAINNET_CHAIN_ID = 5042 as const

const arcFact = requireChain(ARC_MAINNET_CHAIN_ID)
const usdcFact = getUsdc(ARC_MAINNET_CHAIN_ID)

if (arcFact.isTestnet || !arcFact.nativeCurrency.isUsdc || !usdcFact) {
  throw new Error('Network config error: chain 5042 must be Arc Mainnet with USDC as the gas token.')
}

function parseHttpsUrls(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => {
      try {
        return new URL(value).protocol === 'https:'
      } catch {
        return false
      }
    })
}

const env = import.meta.env as Record<string, string | undefined>

/**
 * Extra public Arc Mainnet endpoints listed in the official Arc docs
 * (https://docs.arc.io/arc/references/connect-to-arc.md, "RPC endpoints").
 * Used only when the primary endpoint is rate limiting or unreachable, and only
 * after the endpoint proves it is chain 5042 (see `createArcTransport`).
 */
export const ARC_OFFICIAL_FALLBACK_RPC_URLS: readonly string[] = ['https://rpc.blockdaemon.mainnet.arc.io']

/** Ordered, de-duplicated list of RPC endpoints. Index 0 is tried first. */
export const ARC_RPC_URLS: readonly string[] = Array.from(
  new Set([
    ...parseHttpsUrls(env.VITE_ARC_RPC_URL),
    ...arcFact.rpcUrls,
    ...parseHttpsUrls(env.VITE_ARC_RPC_FALLBACK_URLS),
    ...ARC_OFFICIAL_FALLBACK_RPC_URLS,
  ]),
)

export const ARC_EXPLORER_URL = arcFact.explorerBase

export const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: 'Arc Mainnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: arcFact.nativeCurrency.symbol,
    decimals: arcFact.nativeCurrency.decimals,
  },
  rpcUrls: { default: { http: [...ARC_RPC_URLS] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: ARC_EXPLORER_URL } },
})

/** ERC-20 view of USDC (6 decimals). The same funds as the native gas balance. */
export const ARC_USDC = {
  address: usdcFact.address as Address,
  decimals: usdcFact.decimals,
} as const

/**
 * EIP-7708 system emitter. Every explicit USDC movement (native sends, ERC-20
 * transfers, mint, burn) emits one 18-decimal `Transfer` log from here, so it is
 * the single source for transaction history. Do not also read the ERC-20 logs:
 * that would count an ERC-20 transfer twice.
 */
export const ARC_SYSTEM_TRANSFER_EMITTER: Address = '0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE'
export const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const

/** Arc drops transactions whose maxFeePerGas is under 20 gwei without any receipt. */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n

export const RPC_SETTINGS = {
  timeoutMs: 10_000,
  retryCount: 3,
  retryDelayMs: 300,
  healthPollMs: 15_000,
  /**
   * The public endpoint rejects bursts (about 20 calls inside a few hundred ms
   * return "rate limit exceeded") but accepts a steady stream. Requests are
   * therefore started at most one per `minSpacingMs` with `maxConcurrent` in flight.
   */
  maxConcurrent: 6,
  minSpacingMs: 45,
  /** After a rate limit an endpoint is skipped this long while another one is available. */
  cooldownMs: 15_000,
} as const

export const HISTORY_SETTINGS = {
  /** Blocks per eth_getLogs request. Public endpoints cap the range, so stay small. */
  chunkBlocks: Math.max(500, Number(env.VITE_HISTORY_CHUNK_BLOCKS) || 5_000),
  /** Chunks scanned per "scan" pass before pausing and offering to go further back. */
  chunksPerPass: 24,
  /** Stop a pass early once this many entries are found. */
  targetEntries: 10,
  livePollMs: 6_000,
} as const

export const RECEIPT_SETTINGS = {
  pollMs: 1_000,
  /** After this long we stop waiting, but never resubmit: the tx may still land. */
  waitTimeoutMs: 90_000,
} as const
