/**
 * Direct Uniswap V3 swapping on Arc Mainnet. No API, no API key, no custom contract.
 *
 * - Pools are found with the V3 factory's getPool for every fee tier (direct and two-hop through
 *   USDC or WETH) and read from the pools themselves (liquidity and slot0).
 * - Quotes come from Uniswap's QuoterV2 (an eth_call that runs the real pool math).
 * - Swaps are SwapRouter02 calls wrapped in multicall(deadline, ...), so they revert onchain if mined late.
 * - Nothing is invented: if no pool or quote exists the swap stops with a clear error.
 * The pure helpers (path encoding, slippage, price impact) are exported so they can be tested offline.
 */
import {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  encodePacked,
  erc20Abi,
  parseAbi,
  type Address,
  type Hex,
} from 'viem'
import { QUOTER_V2_ABI, SWAP_ROUTER02_ABI, V3_FACTORY_ABI, V3_POOL_ABI } from '../../config/abi-uniswap'
import {
  ROUTING_HUBS,
  SWAP_SETTINGS,
  SWAP_TOKENS,
  UNISWAP_V3,
  V3_FEE_TIERS,
  type SwapTokenConfig,
} from '../../config/uniswap'
import { collectMessages, isTransientRpcError, publicClient, withRpcRetry } from './rpc'
import { getFees } from './send'
import { MULTICALL3 } from './swapTokens'

export type SwapErrorKind = 'no-route' | 'network' | 'invalid' | 'unsafe' | 'simulation'

/** Why a swap or approval was stopped before the wallet. Drives what the UI refreshes and explains. */
export type SwapFailureReason =
  | 'rpc' // the RPC was rate limiting / unreachable: the transaction was NOT judged, nothing is wrong with the swap itself
  | 'allowance'
  | 'balance'
  | 'price-moved'
  | 'deadline'
  | 'token-restriction'
  | 'revert'

export class SwapError extends Error {
  readonly kind: SwapErrorKind
  readonly reason?: SwapFailureReason
  /** Plain lines (stage, revert reason, amounts, allowance, deadline, raw RPC text) shown under "Technical details". */
  readonly diagnostics: readonly string[]
  constructor(kind: SwapErrorKind, message: string, extra?: { reason?: SwapFailureReason; diagnostics?: readonly string[] }) {
    super(message)
    this.name = 'SwapError'
    this.kind = kind
    this.reason = extra?.reason
    this.diagnostics = extra?.diagnostics ?? []
  }
}

const ZERO = '0x0000000000000000000000000000000000000000'
const Q96 = 2n ** 96n

export function tokenBySymbol(symbol: string): SwapTokenConfig {
  const found = SWAP_TOKENS.find((token) => token.symbol === symbol)
  if (!found) throw new SwapError('invalid', `${symbol} is not a supported swap token.`)
  return found
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Minimum received after slippage (percent, two decimals), always rounded down. */
export function minAfterSlippage(amountOut: bigint, slippagePercent: number): bigint {
  const bps = BigInt(Math.round(slippagePercent * 100))
  return (amountOut * (10_000n - bps)) / 10_000n
}

/* ---------- Types ---------- */

export interface QuoteParams {
  tokenIn: SwapTokenConfig
  tokenOut: SwapTokenConfig
  amountIn: bigint
  swapper: Address
  slippage: number
}

export interface PoolInfo {
  address: Address
  fee: number
  token0: Address
  token1: Address
  liquidity: bigint
  sqrtPriceX96: bigint
}

export interface RouteHop {
  pool: PoolInfo
  tokenIn: SwapTokenConfig
  tokenOut: SwapTokenConfig
}

export interface RouteCandidate {
  hops: RouteHop[]
}

export interface AlternativeRoute {
  label: string
  amountOut: bigint
}

export interface SwapQuoteView {
  params: QuoteParams
  route: RouteHop[]
  /** Quoter output for the chosen route. */
  amountOut: bigint
  minOut: bigint
  /** Percent, excluding pool fees. */
  priceImpact: number
  /** Gas estimate for the swap (quoter pool math plus router overhead). It is replaced by a real estimate before signing. */
  gasEstimate: bigint
  gasFeeWei: bigint
  alternatives: AlternativeRoute[]
  /** Every pool with liquidity that was considered, for the details panel. */
  poolsConsidered: number
  fetchedAt: number
}

/* ---------- Pure helpers ---------- */

/** Packs tokens and fees into the path format the router and quoter expect: token(20) fee(3) token(20) ... */
export function encodePath(route: readonly RouteHop[]): Hex {
  const first = route[0]
  if (!first) throw new SwapError('invalid', 'Empty route.')
  const types: ('address' | 'uint24')[] = ['address']
  const values: (Address | number)[] = [first.tokenIn.address]
  for (const hop of route) {
    types.push('uint24', 'address')
    values.push(hop.pool.fee, hop.tokenOut.address)
  }
  return encodePacked(types, values)
}

/** Output expected at the pools' current prices, after pool fees but with zero price impact. */
export function expectedOutAtSpot(route: readonly RouteHop[], amountIn: bigint): bigint {
  let amount = amountIn
  for (const hop of route) {
    const sqrt = hop.pool.sqrtPriceX96
    const tokenInIsToken0 = sameAddress(hop.tokenIn.address, hop.pool.token0)
    const raw = tokenInIsToken0 ? (amount * sqrt * sqrt) / (Q96 * Q96) : (amount * Q96 * Q96) / (sqrt * sqrt)
    amount = (raw * BigInt(1_000_000 - hop.pool.fee)) / 1_000_000n
  }
  return amount
}

/** Price impact in percent (never negative): how far the executed output falls below the spot-price output. Pool fees excluded. */
export function priceImpactPercent(route: readonly RouteHop[], amountIn: bigint, amountOut: bigint): number {
  const expected = expectedOutAtSpot(route, amountIn)
  if (expected <= 0n || amountOut >= expected) return 0
  return Number(((expected - amountOut) * 1_000_000n) / expected) / 10_000
}

/** 500 -> "0.05%", 3000 -> "0.3%", 10000 -> "1%". */
export function feePercentLabel(fee: number): string {
  return `${parseFloat((fee / 10_000).toFixed(4))}%`
}

export function routeLabel(route: readonly RouteHop[]): string {
  const first = route[0]
  if (!first) return ''
  return [first.tokenIn.symbol, ...route.map((hop) => hop.tokenOut.symbol)].join(' → ')
}

/** Validates user-controlled inputs before any network call. */
export function assertValidRequest(params: QuoteParams): void {
  const supported = (token: SwapTokenConfig) => SWAP_TOKENS.some((known) => sameAddress(known.address, token.address) && known.decimals === token.decimals)
  if (!supported(params.tokenIn) || !supported(params.tokenOut)) throw new SwapError('invalid', 'That token is not supported for swaps here.')
  if (sameAddress(params.tokenIn.address, params.tokenOut.address)) throw new SwapError('invalid', 'Choose two different tokens.')
  if (params.amountIn <= 0n) throw new SwapError('invalid', 'Enter an amount greater than zero.')
  if (!(params.slippage >= SWAP_SETTINGS.minSlippage && params.slippage <= SWAP_SETTINGS.maxSlippage)) {
    throw new SwapError('invalid', `Slippage must be between ${SWAP_SETTINGS.minSlippage}% and ${SWAP_SETTINGS.maxSlippage}%.`)
  }
}

/* ---------- Pool discovery ---------- */

const MULTICALL3_ABI = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) payable returns (Result[] returnData)',
])

interface RawCall {
  target: Address
  data: Hex
}

/** Runs many read-only calls in one RPC request through Multicall3, falling back to individual calls. */
async function batchCall(calls: RawCall[]): Promise<({ ok: true; data: Hex } | { ok: false })[]> {
  if (calls.length === 0) return []
  try {
    const result = await withRpcRetry(() =>
      publicClient.call({
        to: MULTICALL3,
        data: encodeFunctionData({
          abi: MULTICALL3_ABI,
          functionName: 'aggregate3',
          args: [calls.map((call) => ({ target: call.target, allowFailure: true, callData: call.data }))],
        }),
      }),
    )
    if (!result.data) throw new Error('empty multicall')
    const decoded = decodeFunctionResult({ abi: MULTICALL3_ABI, functionName: 'aggregate3', data: result.data })
    return decoded.map((entry) => (entry.success ? { ok: true as const, data: entry.returnData } : { ok: false as const }))
  } catch {
    return Promise.all(
      calls.map(async (call) => {
        try {
          const single = await withRpcRetry(() => publicClient.call({ to: call.target, data: call.data }))
          return single.data ? { ok: true as const, data: single.data } : { ok: false as const }
        } catch {
          return { ok: false as const }
        }
      }),
    )
  }
}

function pairKey(a: SwapTokenConfig, b: SwapTokenConfig): string {
  return [a.address, b.address].map((x) => x.toLowerCase()).sort().join(':')
}

/** Finds every V3 pool (all fee tiers) for the given token pairs and reads liquidity and price from each. */
export async function discoverPools(pairs: readonly [SwapTokenConfig, SwapTokenConfig][]): Promise<Map<string, PoolInfo[]>> {
  const unique = new Map<string, [SwapTokenConfig, SwapTokenConfig]>()
  for (const pair of pairs) unique.set(pairKey(pair[0], pair[1]), pair)
  const lookups = [...unique.entries()].flatMap(([key, [a, b]]) => V3_FEE_TIERS.map((fee) => ({ key, a, b, fee })))

  const poolResults = await batchCall(
    lookups.map((lookup) => ({
      target: UNISWAP_V3.factory,
      data: encodeFunctionData({ abi: V3_FACTORY_ABI, functionName: 'getPool', args: [lookup.a.address, lookup.b.address, lookup.fee] }),
    })),
  )
  const found: { key: string; fee: number; address: Address }[] = []
  lookups.forEach((lookup, index) => {
    const result = poolResults[index]
    if (result?.ok) {
      const address = decodeFunctionResult({ abi: V3_FACTORY_ABI, functionName: 'getPool', data: result.data })
      if (address !== ZERO) found.push({ key: lookup.key, fee: lookup.fee, address })
    }
  })

  const stateCalls: RawCall[] = found.flatMap((pool) => [
    { target: pool.address, data: encodeFunctionData({ abi: V3_POOL_ABI, functionName: 'liquidity' }) },
    { target: pool.address, data: encodeFunctionData({ abi: V3_POOL_ABI, functionName: 'slot0' }) },
    { target: pool.address, data: encodeFunctionData({ abi: V3_POOL_ABI, functionName: 'token0' }) },
  ])
  const states = await batchCall(stateCalls)

  const byPair = new Map<string, PoolInfo[]>()
  found.forEach((pool, index) => {
    const [liquidityResult, slotResult, token0Result] = [states[index * 3], states[index * 3 + 1], states[index * 3 + 2]]
    if (!liquidityResult?.ok || !slotResult?.ok || !token0Result?.ok) return
    const liquidity = decodeFunctionResult({ abi: V3_POOL_ABI, functionName: 'liquidity', data: liquidityResult.data })
    const slot = decodeFunctionResult({ abi: V3_POOL_ABI, functionName: 'slot0', data: slotResult.data })
    const token0 = decodeFunctionResult({ abi: V3_POOL_ABI, functionName: 'token0', data: token0Result.data })
    const [a, b] = unique.get(pool.key) ?? []
    if (!a || !b) return
    const token1 = sameAddress(token0, a.address) ? b.address : a.address
    const info: PoolInfo = { address: pool.address, fee: pool.fee, token0, token1, liquidity, sqrtPriceX96: slot[0] }
    byPair.set(pool.key, [...(byPair.get(pool.key) ?? []), info])
  })
  return byPair
}

/** Builds direct and two-hop candidates from pools that currently hold liquidity. */
export function buildCandidates(tokenIn: SwapTokenConfig, tokenOut: SwapTokenConfig, pools: Map<string, PoolInfo[]>): RouteCandidate[] {
  const live = (a: SwapTokenConfig, b: SwapTokenConfig) => (pools.get(pairKey(a, b)) ?? []).filter((pool) => pool.liquidity > 0n && pool.sqrtPriceX96 > 0n)
  const candidates: RouteCandidate[] = []
  for (const pool of live(tokenIn, tokenOut)) candidates.push({ hops: [{ pool, tokenIn, tokenOut }] })
  for (const symbol of ROUTING_HUBS) {
    const hub = SWAP_TOKENS.find((token) => token.symbol === symbol)
    if (!hub || sameAddress(hub.address, tokenIn.address) || sameAddress(hub.address, tokenOut.address)) continue
    for (const first of live(tokenIn, hub)) {
      for (const second of live(hub, tokenOut)) {
        candidates.push({ hops: [{ pool: first, tokenIn, tokenOut: hub }, { pool: second, tokenIn: hub, tokenOut }] })
      }
    }
  }
  return candidates
}

interface Quoted {
  candidate: RouteCandidate
  amountOut: bigint
  gas: bigint
}

async function quoteCandidates(candidates: RouteCandidate[], amountIn: bigint): Promise<Quoted[]> {
  const calls: RawCall[] = candidates.map((candidate) => {
    const [only] = candidate.hops
    if (candidate.hops.length === 1 && only) {
      return {
        target: UNISWAP_V3.quoterV2,
        data: encodeFunctionData({
          abi: QUOTER_V2_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{ tokenIn: only.tokenIn.address, tokenOut: only.tokenOut.address, amountIn, fee: only.pool.fee, sqrtPriceLimitX96: 0n }],
        }),
      }
    }
    return {
      target: UNISWAP_V3.quoterV2,
      data: encodeFunctionData({ abi: QUOTER_V2_ABI, functionName: 'quoteExactInput', args: [encodePath(candidate.hops), amountIn] }),
    }
  })
  const results = await batchCall(calls)
  const quoted: Quoted[] = []
  candidates.forEach((candidate, index) => {
    const result = results[index]
    if (!result?.ok) return
    try {
      if (candidate.hops.length === 1) {
        const [amountOut, , , gas] = decodeFunctionResult({ abi: QUOTER_V2_ABI, functionName: 'quoteExactInputSingle', data: result.data })
        if (amountOut > 0n) quoted.push({ candidate, amountOut, gas })
      } else {
        const [amountOut, , , gas] = decodeFunctionResult({ abi: QUOTER_V2_ABI, functionName: 'quoteExactInput', data: result.data })
        if (amountOut > 0n) quoted.push({ candidate, amountOut, gas })
      }
    } catch {
      // A malformed quoter reply means this candidate is unusable.
    }
  })
  return quoted
}

/** Finds the best live route and prices it with the QuoterV2. Throws a SwapError when nothing can be quoted. */
export async function fetchQuote(params: QuoteParams): Promise<SwapQuoteView> {
  assertValidRequest(params)
  const { tokenIn, tokenOut, amountIn } = params

  const pairs: [SwapTokenConfig, SwapTokenConfig][] = [[tokenIn, tokenOut]]
  for (const symbol of ROUTING_HUBS) {
    const hub = SWAP_TOKENS.find((token) => token.symbol === symbol)
    if (hub && !sameAddress(hub.address, tokenIn.address) && !sameAddress(hub.address, tokenOut.address)) {
      pairs.push([tokenIn, hub], [hub, tokenOut])
    }
  }

  let pools: Map<string, PoolInfo[]>
  try {
    pools = await discoverPools(pairs)
  } catch {
    throw new SwapError('network', 'Could not read Uniswap pools from the Arc RPC. Check your connection and try again.')
  }
  const candidates = buildCandidates(tokenIn, tokenOut, pools)
  const poolsConsidered = new Set(candidates.flatMap((candidate) => candidate.hops.map((hop) => hop.pool.address))).size
  if (candidates.length === 0) {
    const anyPool = [...pools.values()].some((list) => list.length > 0)
    throw new SwapError(
      'no-route',
      anyPool
        ? `Uniswap has pools for ${tokenIn.symbol}/${tokenOut.symbol} but none currently hold liquidity. Try another pair.`
        : `No Uniswap V3 pool exists for ${tokenIn.symbol} → ${tokenOut.symbol} on Arc, directly or through USDC or WETH.`,
    )
  }

  let quoted: Quoted[]
  try {
    quoted = await quoteCandidates(candidates, amountIn)
  } catch {
    throw new SwapError('network', 'Could not get a quote from Uniswap on Arc. Try again.')
  }
  if (quoted.length === 0) {
    throw new SwapError('no-route', 'Not enough liquidity for this amount. Try a smaller amount.')
  }

  quoted.sort((a, b) => (a.amountOut === b.amountOut ? a.candidate.hops.length - b.candidate.hops.length : a.amountOut > b.amountOut ? -1 : 1))
  const best = quoted[0]
  if (!best) throw new SwapError('no-route', 'No route could be priced.')
  const route = best.candidate.hops
  const gasEstimate = best.gas + SWAP_SETTINGS.gasOverhead
  const fees = await getFees().catch(() => null)
  const gasFeeWei = fees ? gasEstimate * fees.maxFeePerGas : 0n

  return {
    params,
    route,
    amountOut: best.amountOut,
    minOut: minAfterSlippage(best.amountOut, params.slippage),
    priceImpact: priceImpactPercent(route, amountIn, best.amountOut),
    gasEstimate,
    gasFeeWei,
    alternatives: quoted.slice(1, 4).map((item) => ({ label: describeRoute(item.candidate.hops), amountOut: item.amountOut })),
    poolsConsidered,
    fetchedAt: Date.now(),
  }
}

export function describeRoute(route: readonly RouteHop[]): string {
  return `${routeLabel(route)} (${route.map((hop) => feePercentLabel(hop.pool.fee)).join(' + ')})`
}

/* ---------- Allowance and approval ---------- */

export async function readAllowance(owner: Address, token: SwapTokenConfig): Promise<bigint> {
  return withRpcRetry(() =>
    publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: 'allowance', args: [owner, UNISWAP_V3.swapRouter02] }),
  )
}

/** approve(SwapRouter02, exactly amount). Never unlimited. */
export function buildExactApproval(token: SwapTokenConfig, amount: bigint): { to: Address; data: Hex } {
  return {
    to: token.address,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [UNISWAP_V3.swapRouter02, amount] }),
  }
}

/* ---------- Swap transaction ---------- */

export interface SwapCall {
  to: Address
  data: Hex
  value: 0n
  deadline: bigint
}

/**
 * SwapRouter02.multicall(deadline, [exactInputSingle | exactInput]). The recipient is always the user's wallet,
 * amountOutMinimum is the slippage-protected minimum, and the deadline makes a late transaction revert.
 */
export function buildSwapCall(quote: SwapQuoteView, nowSeconds = Math.floor(Date.now() / 1000)): SwapCall {
  const { params, route } = quote
  assertValidRequest(params)
  const first = route[0]
  if (!first) throw new SwapError('invalid', 'Empty route.')
  const last = route[route.length - 1]
  if (!last || !sameAddress(first.tokenIn.address, params.tokenIn.address) || !sameAddress(last.tokenOut.address, params.tokenOut.address)) {
    throw new SwapError('unsafe', 'The route does not match the selected tokens. Refresh the quote.')
  }
  const deadline = BigInt(nowSeconds + SWAP_SETTINGS.deadlineSeconds)
  const inner =
    route.length === 1
      ? encodeFunctionData({
          abi: SWAP_ROUTER02_ABI,
          functionName: 'exactInputSingle',
          args: [
            {
              tokenIn: first.tokenIn.address,
              tokenOut: first.tokenOut.address,
              fee: first.pool.fee,
              recipient: params.swapper,
              amountIn: params.amountIn,
              amountOutMinimum: quote.minOut,
              sqrtPriceLimitX96: 0n,
            },
          ],
        })
      : encodeFunctionData({
          abi: SWAP_ROUTER02_ABI,
          functionName: 'exactInput',
          args: [{ path: encodePath(route), recipient: params.swapper, amountIn: params.amountIn, amountOutMinimum: quote.minOut }],
        })
  return {
    to: UNISWAP_V3.swapRouter02,
    data: encodeFunctionData({ abi: SWAP_ROUTER02_ABI, functionName: 'multicall', args: [deadline, [inner]] }),
    value: 0n,
    deadline,
  }
}

/* -------------------------------------------------------------------------- */
/* Simulation: tell a real revert apart from an RPC problem                     */
/* -------------------------------------------------------------------------- */

const ERROR_STRING_SELECTOR = '0x08c379a0'
const PANIC_SELECTOR = '0x4e487b71'
const PANIC_REASONS: Record<number, string> = {
  0x01: 'assertion failed',
  0x11: 'arithmetic overflow or underflow',
  0x12: 'division by zero',
  0x21: 'invalid enum value',
  0x32: 'array index out of bounds',
}

/** Finds the hex revert payload anywhere in a viem/RPC error chain. */
export function findRevertData(error: unknown): Hex | null {
  let current: unknown = error
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (typeof current !== 'object') break
    const record = current as { data?: unknown; cause?: unknown }
    const data = record.data
    if (typeof data === 'string' && /^0x[0-9a-fA-F]{8,}/.test(data)) return data as Hex
    if (data && typeof data === 'object') {
      const inner = (data as { data?: unknown }).data
      if (typeof inner === 'string' && /^0x[0-9a-fA-F]{8,}/.test(inner)) return inner as Hex
    }
    current = record.cause
  }
  return null
}

/** Decodes Error(string), Panic(uint256) or names the unknown custom-error selector. */
export function decodeRevertData(data: Hex): string {
  const selector = data.slice(0, 10).toLowerCase()
  try {
    if (selector === ERROR_STRING_SELECTOR) {
      const body = data.slice(10)
      const length = Number(BigInt('0x' + body.slice(64, 128)))
      const hex = body.slice(128, 128 + length * 2)
      return new TextDecoder().decode(Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16)))
    }
    if (selector === PANIC_SELECTOR) {
      const code = Number(BigInt('0x' + data.slice(10, 74)))
      return `Panic(0x${code.toString(16)}): ${PANIC_REASONS[code] ?? 'unknown panic'}`
    }
  } catch {
    // fall through to the selector
  }
  return `custom error ${selector}`
}

export type CallFailure =
  | { type: 'rpc'; raw: string }
  | { type: 'revert'; reason: string | null; raw: string }
  | { type: 'unknown'; raw: string }

/**
 * Sorts a failed eth_call / eth_estimateGas into: the RPC could not answer (rate limit, timeout,
 * network), the EVM reverted (with the decoded reason), or something else that is reported verbatim.
 */
export function classifyCallFailure(error: unknown): CallFailure {
  const raw = collectMessages(error)
  const data = findRevertData(error)
  if (data) return { type: 'revert', reason: decodeRevertData(data), raw }
  const text = raw.toLowerCase()
  const quoted = /execution reverted:?\s*([^|]*)/i.exec(raw)
  if (/revert/.test(text) && !isTransientRpcError(error)) {
    const reason = quoted?.[1]?.trim()
    return { type: 'revert', reason: reason ? reason : null, raw }
  }
  if (isTransientRpcError(error)) return { type: 'rpc', raw }
  return { type: 'unknown', raw }
}

const RPC_BUSY_MESSAGE =
  'The Arc RPC is rate-limiting or unreachable right now, so this transaction could not be simulated yet. Nothing was sent and nothing is wrong with your swap. Wait a few seconds and try again.'

export interface SimulationContext {
  stage: 'swap' | 'approval'
  account: Address
  call: { to: Address; data: Hex; value: bigint }
  quote?: SwapQuoteView
  /** Fresh onchain reads taken just before simulating. */
  allowance?: bigint
  balance?: bigint
  deadline?: bigint
  chainTime?: bigint | null
}

function fmt(amount: bigint | undefined, token: SwapTokenConfig): string {
  return amount === undefined ? 'unknown' : `${formatUnits(amount, token.decimals)} ${token.symbol}`
}

/** The facts a developer needs to understand a failed simulation. */
export function buildDiagnostics(ctx: SimulationContext, failure?: CallFailure): string[] {
  const lines: string[] = [`Stage: ${ctx.stage} simulation (eth_call, then eth_estimateGas) before the wallet`, `From: ${ctx.account}`, `To: ${ctx.call.to}`]
  lines.push(`Calldata selector: ${ctx.call.data.slice(0, 10)}  Value: ${ctx.call.value} wei`)
  if (ctx.quote) {
    const { params, route } = ctx.quote
    lines.push(`Route: ${routeLabel(route)} (${route.map((hop) => `${feePercentLabel(hop.pool.fee)} pool ${hop.pool.address}`).join(' → ')})`)
    lines.push(`Token in: ${params.tokenIn.symbol} ${params.tokenIn.address}  Token out: ${params.tokenOut.symbol} ${params.tokenOut.address}`)
    lines.push(`Amount in: ${fmt(params.amountIn, params.tokenIn)}  Quoted out: ${fmt(ctx.quote.amountOut, params.tokenOut)}  Minimum received: ${fmt(ctx.quote.minOut, params.tokenOut)} (${params.slippage}% slippage)`)
    lines.push(`Your ${params.tokenIn.symbol} balance: ${fmt(ctx.balance, params.tokenIn)}  Allowance to router: ${fmt(ctx.allowance, params.tokenIn)}`)
  }
  if (ctx.deadline !== undefined) {
    lines.push(`Deadline: ${new Date(Number(ctx.deadline) * 1000).toISOString()}${ctx.chainTime ? `  Latest block time: ${new Date(Number(ctx.chainTime) * 1000).toISOString()}` : ''}`)
  }
  if (failure) {
    lines.push(`Failure type: ${failure.type === 'rpc' ? 'RPC problem (not a revert)' : failure.type === 'revert' ? 'EVM revert' : 'unclassified RPC error'}`)
    if (failure.type === 'revert') lines.push(`Revert reason: ${failure.reason ?? '(none returned)'}`)
    lines.push(`RPC said: ${failure.raw.slice(0, 600)}`)
  }
  return lines
}

/** Turns a classified failure into the sentence shown to the user, plus the reason code. */
export function explainFailure(ctx: SimulationContext, failure: CallFailure): { message: string; reason: SwapFailureReason } {
  if (failure.type === 'rpc') return { message: RPC_BUSY_MESSAGE, reason: 'rpc' }
  const symbol = ctx.quote?.params.tokenIn.symbol ?? 'token'
  if (failure.type === 'unknown') {
    return { message: `The Arc RPC rejected the ${ctx.stage} request: ${failure.raw.slice(0, 160) || 'no details'}. It was not sent.`, reason: 'revert' }
  }
  const reason = failure.reason ?? ''
  if (/^STF$|TRANSFER_FROM_FAILED|transferFrom|allowance/i.test(reason) || /exceeds allowance/i.test(failure.raw)) {
    const short = ctx.allowance !== undefined && ctx.quote && ctx.allowance < ctx.quote.params.amountIn
    const poor = ctx.balance !== undefined && ctx.quote && ctx.balance < ctx.quote.params.amountIn
    if (poor) return { message: `Your ${symbol} balance is lower than the amount to swap, so the router could not pull the tokens (reverted "${reason}").`, reason: 'balance' }
    if (short) return { message: `The router's ${symbol} allowance is lower than the amount to swap (reverted "${reason}"). Approve the exact amount first.`, reason: 'allowance' }
    return { message: `The ${symbol} token refused the transfer to the pool (reverted "${reason}") even though your balance and allowance cover it. This usually means a token-level restriction on your address or the pool.`, reason: 'token-restriction' }
  }
  if (/Too little received/i.test(reason)) {
    return { message: 'The pool now pays less than your minimum received (reverted "Too little received"): the price moved beyond your slippage. The quote was refreshed with a new minimum; review it and confirm again.', reason: 'price-moved' }
  }
  if (/Transaction too old/i.test(reason)) {
    return { message: 'The swap deadline had already passed (reverted "Transaction too old"). The quote was refreshed with a new deadline; review it and confirm again.', reason: 'deadline' }
  }
  if (/blocklist|blacklist|blocked/i.test(`${reason} ${failure.raw}`)) {
    return { message: 'A token in this swap blocked the transfer: an address involved is on the token\'s blocklist.', reason: 'token-restriction' }
  }
  if (failure.reason === null || failure.reason === '') {
    return { message: 'The swap reverted without giving a reason. On Arc this usually means a token restriction (for example a blocklisted address) or an unusual pool state. It was not sent; see Technical details.', reason: 'revert' }
  }
  return { message: `The swap would revert onchain: "${reason}". It was not sent; see Technical details.`, reason: 'revert' }
}

/** Kept for callers that only have an error: the user-facing sentence for a classified failure. */
export function explainRevert(error: unknown): string {
  return explainFailure({ stage: 'swap', account: ZERO, call: { to: ZERO, data: '0x', value: 0n } }, classifyCallFailure(error)).message
}

async function readBalanceOf(owner: Address, token: SwapTokenConfig): Promise<bigint> {
  return withRpcRetry(() => publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }))
}

/**
 * Dry-runs a transaction exactly as the wallet will send it (eth_call, then eth_estimateGas) and returns
 * a padded gas limit. A failure is NEVER reported as "this would fail" unless the EVM really reverted:
 * RPC trouble is reported as RPC trouble, and a real revert carries its decoded reason and diagnostics.
 */
export async function simulateTransaction(ctx: SimulationContext): Promise<bigint> {
  const { account, call } = ctx
  const run = async (stage: 'eth_call' | 'eth_estimateGas'): Promise<bigint | null> => {
    try {
      if (stage === 'eth_call') {
        await withRpcRetry(() => publicClient.call({ account, to: call.to, data: call.data, value: call.value }), 6, 600)
        return null
      }
      return await withRpcRetry(() => publicClient.estimateGas({ account, to: call.to, data: call.data, value: call.value }), 6, 600)
    } catch (error) {
      const failure = classifyCallFailure(error)
      let chainTime: bigint | null = null
      if (failure.type === 'revert' && /too old/i.test(failure.reason ?? '')) {
        chainTime = await publicClient.getBlock().then((block) => block.timestamp).catch(() => null)
      }
      const detailed = { ...ctx, chainTime }
      const { message, reason } = explainFailure(detailed, failure)
      throw new SwapError('simulation', message, { reason, diagnostics: [`Failed at: ${stage}`, ...buildDiagnostics(detailed, failure)] })
    }
  }
  await run('eth_call')
  const estimate = (await run('eth_estimateGas')) as bigint
  const gas = (estimate * 12n) / 10n
  if (gas > SWAP_SETTINGS.maxGasLimit) {
    throw new SwapError('unsafe', 'The gas estimate for this transaction is unusually high. It was blocked.', { diagnostics: buildDiagnostics(ctx) })
  }
  return gas
}

/**
 * Swap simulation with fresh onchain checks first, so an allowance or balance problem is named exactly
 * (with the numbers) instead of surfacing as a bare router revert.
 */
export async function simulateSwap(account: Address, call: SwapCall, quote: SwapQuoteView): Promise<bigint> {
  const { tokenIn, amountIn } = quote.params
  let allowance: bigint
  let balance: bigint
  try {
    ;[allowance, balance] = await Promise.all([readAllowance(account, tokenIn), readBalanceOf(account, tokenIn)])
  } catch (error) {
    const failure = classifyCallFailure(error)
    throw new SwapError('network', failure.type === 'rpc' ? RPC_BUSY_MESSAGE : `Could not read your ${tokenIn.symbol} balance and allowance: ${failure.raw.slice(0, 160)}`, {
      reason: 'rpc',
      diagnostics: buildDiagnostics({ stage: 'swap', account, call, quote, deadline: call.deadline }, failure),
    })
  }
  const ctx: SimulationContext = { stage: 'swap', account, call, quote, allowance, balance, deadline: call.deadline }
  if (balance < amountIn) {
    throw new SwapError('simulation', `Your ${tokenIn.symbol} balance (${fmt(balance, tokenIn)}) is lower than the amount to swap (${fmt(amountIn, tokenIn)}).`, {
      reason: 'balance',
      diagnostics: buildDiagnostics(ctx),
    })
  }
  if (allowance < amountIn) {
    throw new SwapError('simulation', `The router's ${tokenIn.symbol} allowance (${fmt(allowance, tokenIn)}) is lower than the amount to swap (${fmt(amountIn, tokenIn)}). Approve the exact amount first.`, {
      reason: 'allowance',
      diagnostics: buildDiagnostics(ctx),
    })
  }
  return simulateTransaction(ctx)
}
