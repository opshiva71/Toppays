import { erc20Abi, formatUnits, parseUnits, type Address } from 'viem'
import { QUOTER_V2_ABI, SWAP_ROUTER02_ABI } from '../../config/abi-uniswap'
import { SWAP_TOKENS, UNISWAP_V3, type SwapTokenConfig } from '../../config/uniswap'
import { publicClient, withRpcRetry } from './rpc'

/** Canonical Multicall3, present on Arc Mainnet (checked onchain). The chain config does not list it, so it is passed explicitly. */
export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

/** Function selectors the swap depends on. They must exist in the deployed bytecode, which proves the interface matches. */
const ROUTER_SELECTORS = ['5ae401dc', '04e45aaf', 'b858183f'] // multicall(uint256,bytes[]), exactInputSingle, exactInput
const QUOTER_SELECTORS = ['c6a5026a', 'cdca1753'] // quoteExactInputSingle, quoteExactInput

/** Reads every swap token balance in one multicall. Values are ERC-20 base units (USDC uses 6 decimals). */
export async function readSwapBalances(owner: Address): Promise<Record<string, bigint>> {
  const results = await withRpcRetry(() =>
    publicClient.multicall({
      allowFailure: true,
      multicallAddress: MULTICALL3,
      contracts: SWAP_TOKENS.map((token) => ({
        address: token.address,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [owner] as const,
      })),
    }),
  )
  const balances: Record<string, bigint> = {}
  SWAP_TOKENS.forEach((token, index) => {
    const result = results[index]
    if (result?.status === 'success') balances[token.symbol] = result.result
  })
  return balances
}

export type CheckState = 'ok' | 'failed'

export interface ContractCheck {
  label: string
  address: Address
  state: CheckState
  detail: string
}

export interface ContractVerification {
  ok: boolean
  checks: ContractCheck[]
}

/**
 * Confirms, onchain, that the contracts the Swap screen relies on exist at the addresses TopPay expects,
 * that they are wired to each other (router and quoter both point at the same V3 factory), that their
 * bytecode contains the functions TopPay calls, and that each token reports the expected symbol and decimals.
 * "Verified" in the UI means exactly this. It does not audit Uniswap's code.
 */
export async function verifySwapContracts(): Promise<ContractVerification> {
  const checks: ContractCheck[] = []
  const targets: { label: string; address: Address; selectors?: string[] }[] = [
    { label: 'Uniswap V3 Factory', address: UNISWAP_V3.factory },
    { label: 'SwapRouter02', address: UNISWAP_V3.swapRouter02, selectors: ROUTER_SELECTORS },
    { label: 'QuoterV2', address: UNISWAP_V3.quoterV2, selectors: QUOTER_SELECTORS },
  ]
  const codes = await Promise.all(
    targets.map((target) => withRpcRetry(() => publicClient.getCode({ address: target.address })).catch(() => undefined)),
  )
  targets.forEach((target, index) => {
    const code = codes[index]
    const hasCode = typeof code === 'string' && code !== '0x'
    const missing = hasCode && target.selectors ? target.selectors.filter((selector) => !code.toLowerCase().includes(selector)) : []
    const ok = hasCode && missing.length === 0
    checks.push({
      label: target.label,
      address: target.address,
      state: ok ? 'ok' : 'failed',
      detail: !hasCode ? 'No contract code at this address' : missing.length ? 'Deployed code does not have the expected functions' : `${(code.length - 2) / 2} bytes of code`,
    })
  })

  const wiring = await Promise.all(
    [
      { label: 'Router uses this factory', address: UNISWAP_V3.swapRouter02, abi: SWAP_ROUTER02_ABI },
      { label: 'Quoter uses this factory', address: UNISWAP_V3.quoterV2, abi: QUOTER_V2_ABI },
    ].map(async (item) => {
      try {
        const linked = await withRpcRetry(() => publicClient.readContract({ address: item.address, abi: item.abi, functionName: 'factory' }))
        return { ...item, linked }
      } catch {
        return { ...item, linked: null }
      }
    }),
  )
  for (const item of wiring) {
    const ok = typeof item.linked === 'string' && item.linked.toLowerCase() === UNISWAP_V3.factory.toLowerCase()
    checks.push({
      label: item.label,
      address: item.address,
      state: ok ? 'ok' : 'failed',
      detail: ok ? 'Points at the Uniswap V3 Factory above' : 'Does not point at the expected factory',
    })
  }

  const metadata = await Promise.all(
    SWAP_TOKENS.map(async (token) => {
      try {
        const [symbol, decimals] = await Promise.all([
          withRpcRetry(() => publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: 'symbol' })),
          withRpcRetry(() => publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: 'decimals' })),
        ])
        return { symbol, decimals }
      } catch {
        return null
      }
    }),
  )
  SWAP_TOKENS.forEach((token, index) => {
    const found = metadata[index]
    const ok = found !== null && found.symbol.toLowerCase() === token.symbol.toLowerCase() && found.decimals === token.decimals
    checks.push({
      label: `${token.symbol} token`,
      address: token.address,
      state: ok ? 'ok' : 'failed',
      detail: found ? `Reports ${found.symbol}, ${found.decimals} decimals` : 'Could not read token details',
    })
  })

  return { ok: checks.every((check) => check.state === 'ok'), checks }
}

/* ---------- Amount helpers ---------- */

/** Keeps digits and one dot, limited to the token's decimals. */
export function sanitizeTokenInput(raw: string, decimals: number): string {
  let cleaned = raw.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
  const [whole = '', fraction] = cleaned.split('.')
  const trimmedWhole = whole.length > 1 ? whole.replace(/^0+(?=\d)/, '') : whole
  return fraction === undefined ? trimmedWhole : `${trimmedWhole}.${fraction.slice(0, decimals)}`
}

export function parseTokenInput(text: string, decimals: number): bigint | null {
  if (!/^\d*\.?\d*$/.test(text) || text === '' || text === '.') return null
  try {
    return parseUnits(text.endsWith('.') ? text.slice(0, -1) : text, decimals)
  } catch {
    return null
  }
}

/** Display string with thousands separators and at most `maxFraction` digits (trailing zeros trimmed). */
export function formatTokenAmount(raw: bigint, token: Pick<SwapTokenConfig, 'decimals'>, maxFraction = 6): string {
  const exact = formatUnits(raw, token.decimals)
  const [whole = '0', fraction = ''] = exact.split('.')
  const limit = Math.min(maxFraction, token.decimals)
  const trimmed = fraction.slice(0, limit).replace(/0+$/, '')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (raw > 0n && grouped === '0' && trimmed === '') return `<${(10 ** -limit).toFixed(limit)}`
  return trimmed ? `${grouped}.${trimmed}` : grouped
}

/** Exchange rate (output per one input token) from real quote amounts. */
export function exchangeRate(
  amountIn: bigint,
  amountOut: bigint,
  tokenIn: Pick<SwapTokenConfig, 'decimals'>,
  tokenOut: Pick<SwapTokenConfig, 'decimals'>,
): number | null {
  if (amountIn <= 0n || amountOut <= 0n) return null
  const scaled = (amountOut * 10n ** BigInt(tokenIn.decimals + 8)) / (amountIn * 10n ** BigInt(tokenOut.decimals))
  return Number(scaled) / 1e8
}

export function formatRate(rate: number): string {
  if (rate >= 1000) return rate.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (rate >= 1) return rate.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return rate.toPrecision(4).replace(/\.?0+$/, '')
}

