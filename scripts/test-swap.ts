/**
 * Offline tests for the direct Uniswap V3 swap logic: path encoding, slippage, price impact, route
 * building, transaction encoding, approvals and error messages. No network, no wallet, no funds.
 *
 *   bun run test:swap
 *
 * Live checks are in `bun run verify:uniswap`; full execution on a local fork is `bun run test:swap-fork`.
 */
import assert from 'node:assert/strict'
import { decodeFunctionData, encodeAbiParameters, getAddress, maxUint256, type Address, type Hex } from 'viem'
import { SWAP_ROUTER02_ABI } from '../config/abi-uniswap'
import { SWAP_SETTINGS, UNISWAP_V3 } from '../config/uniswap'
import { erc20Abi } from 'viem'
import { isRateLimitError } from '../src/services/rpc'
import { exchangeRate, formatRate, formatTokenAmount, parseTokenInput, sanitizeTokenInput } from '../src/services/swapTokens'
import {
  assertValidRequest,
  buildCandidates,
  buildExactApproval,
  buildSwapCall,
  encodePath,
  expectedOutAtSpot,
  buildDiagnostics,
  classifyCallFailure,
  decodeRevertData,
  explainFailure,
  findRevertData,
  feePercentLabel,
  minAfterSlippage,
  priceImpactPercent,
  routeLabel,
  SwapError,
  tokenBySymbol,
  type PoolInfo,
  type QuoteParams,
  type RouteHop,
  type SwapQuoteView,
} from '../src/services/uniswap'

const USDC = tokenBySymbol('USDC')
const EURC = tokenBySymbol('EURC')
const CIRBTC = tokenBySymbol('cirBTC')
const WETH = tokenBySymbol('WETH')
const WALLET: Address = getAddress('0xB6150A23b84ae28aE368c1BbF33B6e7A253da0B4')
const Q96 = 2n ** 96n

let passed = 0
let failed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`PASS  ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL  ${name}\n      ${(error as Error).message.split('\n').slice(0, 4).join('\n      ')}`)
  }
}

function pool(a: typeof USDC, b: typeof USDC, fee: number, sqrtPriceX96 = Q96, liquidity = 1_000_000n): PoolInfo {
  const [token0, token1] = a.address.toLowerCase() < b.address.toLowerCase() ? [a, b] : [b, a]
  return { address: getAddress(`0x${(fee + liquidity.toString()).padStart(40, '1').slice(0, 40)}`), fee, token0: token0.address, token1: token1.address, liquidity, sqrtPriceX96 }
}

function hop(tokenIn: typeof USDC, tokenOut: typeof USDC, fee: number, sqrt = Q96): RouteHop {
  return { pool: pool(tokenIn, tokenOut, fee, sqrt), tokenIn, tokenOut }
}

function fakeQuote(route: RouteHop[], overrides: Partial<SwapQuoteView> = {}, paramsOverrides: Partial<QuoteParams> = {}): SwapQuoteView {
  const first = route[0]
  const last = route[route.length - 1]
  const params: QuoteParams = { tokenIn: first.tokenIn, tokenOut: last.tokenOut, amountIn: 5_000_000n, swapper: WALLET, slippage: 0.5, ...paramsOverrides }
  return {
    params,
    route,
    amountOut: 4_000_000n,
    minOut: minAfterSlippage(4_000_000n, params.slippage),
    priceImpact: 0.1,
    gasEstimate: 200_000n,
    gasFeeWei: 1n,
    alternatives: [],
    poolsConsidered: 1,
    fetchedAt: Date.now(),
    ...overrides,
  }
}

/* ---------- slippage and labels ---------- */

test('minimum received rounds down and honors two-decimal slippage', () => {
  assert.equal(minAfterSlippage(1_000_000n, 0.5), 995_000n)
  assert.equal(minAfterSlippage(1_000_000n, 1), 990_000n)
  assert.equal(minAfterSlippage(1_000_000n, 0.01), 999_900n)
  assert.equal(minAfterSlippage(123_456_789n, 0.5), 122_839_505n) // floor of 122_839_505.055
  assert.equal(minAfterSlippage(1n, 0.5), 0n)
  assert.ok(minAfterSlippage(9_999_999n, 0.1) < 9_999_999n)
})

test('fee tier and route labels', () => {
  assert.equal(feePercentLabel(100), '0.01%')
  assert.equal(feePercentLabel(500), '0.05%')
  assert.equal(feePercentLabel(3000), '0.3%')
  assert.equal(feePercentLabel(10000), '1%')
  assert.equal(routeLabel([hop(EURC, USDC, 500), hop(USDC, CIRBTC, 100)]), 'EURC → USDC → cirBTC')
})

/* ---------- path encoding ---------- */

test('path encoding is token(20) fee(3) token(20) [fee(3) token(20)]', () => {
  const single = encodePath([hop(USDC, EURC, 500)])
  assert.equal(single, `0x${USDC.address.slice(2)}0001f4${EURC.address.slice(2)}`.toLowerCase())
  const double = encodePath([hop(EURC, USDC, 500), hop(USDC, CIRBTC, 100)])
  assert.equal(double, `0x${EURC.address.slice(2)}0001f4${USDC.address.slice(2)}000064${CIRBTC.address.slice(2)}`.toLowerCase())
  assert.equal((double.length - 2) / 2, 20 + 3 + 20 + 3 + 20)
  assert.throws(() => encodePath([]), SwapError)
})

/* ---------- price math ---------- */

test('spot output follows pool price and direction, minus the pool fee', () => {
  // price 4 token1 per token0 (sqrt = 2 * 2^96)
  const p = pool(USDC, EURC, 500, 2n * Q96)
  const token0Symbol = p.token0.toLowerCase() === USDC.address.toLowerCase() ? USDC : EURC
  const token1Symbol = token0Symbol === USDC ? EURC : USDC
  const forward = expectedOutAtSpot([{ pool: p, tokenIn: token0Symbol, tokenOut: token1Symbol }], 1_000_000n)
  assert.equal(forward, (4_000_000n * 999_500n) / 1_000_000n)
  const backward = expectedOutAtSpot([{ pool: p, tokenIn: token1Symbol, tokenOut: token0Symbol }], 1_000_000n)
  assert.equal(backward, (250_000n * 999_500n) / 1_000_000n)
})

test('two-hop spot output multiplies each hop including both fees', () => {
  const route = [hop(EURC, USDC, 500), hop(USDC, CIRBTC, 100)]
  const out = expectedOutAtSpot(route, 10_000_000n)
  assert.equal(out, (((10_000_000n * 999_500n) / 1_000_000n) * 999_900n) / 1_000_000n)
})

test('price impact is zero at spot, grows with a worse fill, and never goes negative', () => {
  const route = [hop(USDC, EURC, 500)]
  const spot = expectedOutAtSpot(route, 1_000_000n)
  assert.equal(priceImpactPercent(route, 1_000_000n, spot), 0)
  assert.equal(priceImpactPercent(route, 1_000_000n, spot + 1000n), 0)
  assert.equal(Math.round(priceImpactPercent(route, 1_000_000n, spot - spot / 10n) * 100) / 100, 10)
  assert.equal(Math.round(priceImpactPercent(route, 1_000_000n, spot / 2n) * 10) / 10, 50)
  assert.equal(priceImpactPercent(route, 0n, 0n), 0)
})

/* ---------- candidates ---------- */

test('candidates: direct pools, then two hops through USDC or WETH, only with liquidity', () => {
  const key = (a: typeof USDC, b: typeof USDC) => [a.address, b.address].map((x) => x.toLowerCase()).sort().join(':')
  const pools = new Map<string, PoolInfo[]>()
  pools.set(key(EURC, CIRBTC), [pool(EURC, CIRBTC, 3000, Q96, 0n)]) // empty direct pool must be ignored
  pools.set(key(EURC, USDC), [pool(EURC, USDC, 500), pool(EURC, USDC, 100, Q96, 0n)])
  pools.set(key(USDC, CIRBTC), [pool(USDC, CIRBTC, 100), pool(USDC, CIRBTC, 10000)])
  pools.set(key(EURC, WETH), [])
  const candidates = buildCandidates(EURC, CIRBTC, pools)
  assert.equal(candidates.length, 2) // 1 EURC/USDC pool with liquidity x 2 USDC/cirBTC pools
  assert.ok(candidates.every((c) => c.hops.length === 2 && c.hops[0].tokenOut.symbol === 'USDC'))
  const direct = buildCandidates(USDC, EURC, new Map([[key(USDC, EURC), [pool(USDC, EURC, 500)]]]))
  assert.equal(direct.length, 1)
  assert.equal(direct[0].hops.length, 1)
  // a hub that equals an endpoint is never used as an intermediate
  assert.equal(buildCandidates(USDC, WETH, new Map([[key(USDC, WETH), [pool(USDC, WETH, 3000)]]])).every((c) => c.hops.length === 1), true)
})

/* ---------- swap transaction ---------- */

test('single-hop swap is router.multicall(deadline, [exactInputSingle]) to the user with the slippage minimum', () => {
  const quote = fakeQuote([hop(USDC, EURC, 500)])
  const now = 1_800_000_000
  const call = buildSwapCall(quote, now)
  assert.equal(call.to, UNISWAP_V3.swapRouter02)
  assert.equal(call.value, 0n)
  assert.equal(call.deadline, BigInt(now + SWAP_SETTINGS.deadlineSeconds))
  const outer = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: call.data })
  assert.equal(outer.functionName, 'multicall')
  const [deadline, inner] = outer.args as readonly [bigint, readonly `0x${string}`[]]
  assert.equal(deadline, call.deadline)
  assert.equal(inner.length, 1)
  const decoded = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: inner[0] })
  assert.equal(decoded.functionName, 'exactInputSingle')
  const args = (decoded.args as readonly [{ tokenIn: Address; tokenOut: Address; fee: number; recipient: Address; amountIn: bigint; amountOutMinimum: bigint; sqrtPriceLimitX96: bigint }])[0]
  assert.equal(args.tokenIn, USDC.address)
  assert.equal(args.tokenOut, EURC.address)
  assert.equal(args.fee, 500)
  assert.equal(args.recipient, WALLET) // never the router or another address
  assert.equal(args.amountIn, 5_000_000n)
  assert.equal(args.amountOutMinimum, quote.minOut)
  assert.equal(args.sqrtPriceLimitX96, 0n)
})

test('multi-hop swap uses exactInput with the encoded path', () => {
  const route = [hop(EURC, USDC, 500), hop(USDC, CIRBTC, 100)]
  const quote = fakeQuote(route)
  const call = buildSwapCall(quote, 1_800_000_000)
  const outer = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: call.data })
  const [, inner] = outer.args as readonly [bigint, readonly `0x${string}`[]]
  const decoded = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: inner[0] })
  assert.equal(decoded.functionName, 'exactInput')
  const args = (decoded.args as readonly [{ path: `0x${string}`; recipient: Address; amountIn: bigint; amountOutMinimum: bigint }])[0]
  assert.equal(args.path, encodePath(route))
  assert.equal(args.recipient, WALLET)
  assert.equal(args.amountOutMinimum, quote.minOut)
})

test('a route that does not match the selected tokens is refused', () => {
  const quote = fakeQuote([hop(USDC, EURC, 500)], {}, { tokenOut: CIRBTC })
  assert.throws(() => buildSwapCall(quote), (error) => error instanceof SwapError && error.kind === 'unsafe')
})

/* ---------- approvals ---------- */

test('approval is approve(SwapRouter02, exactly the amount) and never unlimited', () => {
  const approval = buildExactApproval(USDC, 5_000_000n)
  assert.equal(approval.to, USDC.address)
  const decoded = decodeFunctionData({ abi: erc20Abi, data: approval.data })
  assert.equal(decoded.functionName, 'approve')
  const [spender, amount] = decoded.args
  assert.equal(spender, UNISWAP_V3.swapRouter02)
  assert.equal(amount, 5_000_000n)
  assert.notEqual(amount, maxUint256)
})

/* ---------- request validation ---------- */

test('invalid requests are rejected before any network call', () => {
  const ok: QuoteParams = { tokenIn: USDC, tokenOut: EURC, amountIn: 1n, swapper: WALLET, slippage: 0.5 }
  assert.doesNotThrow(() => assertValidRequest(ok))
  assert.throws(() => assertValidRequest({ ...ok, tokenOut: USDC }), SwapError)
  assert.throws(() => assertValidRequest({ ...ok, amountIn: 0n }), SwapError)
  assert.throws(() => assertValidRequest({ ...ok, slippage: 0 }), SwapError)
  assert.throws(() => assertValidRequest({ ...ok, slippage: 51 }), SwapError)
  assert.throws(() => assertValidRequest({ ...ok, tokenOut: { ...EURC, address: getAddress('0x00000000000000000000000000000000000000aa') } }), SwapError)
  assert.throws(() => assertValidRequest({ ...ok, tokenOut: { ...EURC, decimals: 18 } }), SwapError)
})

/* ---------- error messages ---------- */

/* ---------- simulation failures: RPC trouble is NOT "this swap would fail" ---------- */

const ACCOUNT: Address = '0xB6150A23b84ae28aE368c1BbF33B6e7A253da0B4'
const usdcT = tokenBySymbol('USDC')
const eurcT = tokenBySymbol('EURC')
const sampleQuote = (): SwapQuoteView => {
  const pool: PoolInfo = { address: '0x00000000000000000000000000000000000000a1', token0: usdcT.address, token1: eurcT.address, fee: 500, liquidity: 1n, sqrtPriceX96: Q96 }
  return {
    params: { tokenIn: usdcT, tokenOut: eurcT, amountIn: 10_000n, swapper: ACCOUNT, slippage: 0.5 },
    route: [{ pool, tokenIn: usdcT, tokenOut: eurcT }],
    amountOut: 8_929n,
    minOut: 8_884n,
    priceImpact: 0,
    gasEstimate: 100_000n,
    gasFeeWei: 0n,
    alternatives: [],
    poolsChecked: 1,
    fetchedAt: Date.now(),
    deadlineSeconds: 1200,
  } as unknown as SwapQuoteView
}
const ctxFor = (extra: Record<string, unknown> = {}) => ({
  stage: 'swap' as const,
  account: ACCOUNT,
  call: { to: UNISWAP_V3.swapRouter02, data: '0x5ae401dc' as Hex, value: 0n },
  quote: sampleQuote(),
  deadline: 1_900_000_000n,
  ...extra,
})
const errorStringData = (text: string): Hex => `0x08c379a0${encodeAbiParameters([{ type: 'string' }], [text]).slice(2)}` as Hex

test('REGRESSION: "rate limit exceeded" is an RPC problem, never reported as a failing swap', () => {
  for (const text of ['rate limit exceeded', 'HTTP request failed. Status: 429', 'RPC error -32005 limit exceeded', 'The request timed out', 'Failed to fetch']) {
    const failure = classifyCallFailure(new Error(text))
    assert.equal(failure.type, 'rpc', text)
    const { message, reason } = explainFailure(ctxFor(), failure)
    assert.equal(reason, 'rpc', text)
    assert.match(message, /rate-limiting or unreachable/)
    assert.match(message, /Nothing was sent and nothing is wrong with your swap/)
    assert.doesNotMatch(message, /would (fail|revert)/)
  }
  assert.equal(isRateLimitError(new Error('rate limit exceeded')), true)
  assert.equal(isRateLimitError(new Error('execution reverted: STF')), false)
})

test('revert data is decoded: Error(string), Panic and unknown custom errors', () => {
  assert.equal(decodeRevertData(errorStringData('STF')), 'STF')
  assert.equal(decodeRevertData(errorStringData('Too little received')), 'Too little received')
  assert.match(decodeRevertData(('0x4e487b71' + '11'.padStart(64, '0')) as Hex), /Panic\(0x11\).*overflow/)
  assert.match(decodeRevertData('0xdeadbeef'), /custom error 0xdeadbeef/)
  const nested = Object.assign(new Error('call failed'), { cause: Object.assign(new Error('rpc'), { data: errorStringData('STF') }) })
  assert.equal(findRevertData(nested), errorStringData('STF'))
  const failure = classifyCallFailure(nested)
  assert.deepEqual({ type: failure.type, reason: failure.type === 'revert' ? failure.reason : undefined }, { type: 'revert', reason: 'STF' })
})

test('a real STF revert is explained with the allowance and balance that were read', () => {
  const failure = { type: 'revert' as const, reason: 'STF', raw: 'execution reverted: STF' }
  assert.equal(explainFailure(ctxFor({ allowance: 5_000n, balance: 50_000n }), failure).reason, 'allowance')
  assert.match(explainFailure(ctxFor({ allowance: 5_000n, balance: 50_000n }), failure).message, /allowance is lower/)
  assert.equal(explainFailure(ctxFor({ allowance: 50_000n, balance: 5_000n }), failure).reason, 'balance')
  const enough = explainFailure(ctxFor({ allowance: 50_000n, balance: 50_000n }), failure)
  assert.equal(enough.reason, 'token-restriction')
  assert.match(enough.message, /even though your balance and allowance cover it/)
})

test('price moved, deadline, unknown and empty reverts each get a specific message and reason', () => {
  const price = explainFailure(ctxFor(), { type: 'revert', reason: 'Too little received', raw: '' })
  assert.equal(price.reason, 'price-moved')
  assert.match(price.message, /refreshed with a new minimum/)
  const old = explainFailure(ctxFor(), { type: 'revert', reason: 'Transaction too old', raw: '' })
  assert.equal(old.reason, 'deadline')
  const other = explainFailure(ctxFor(), { type: 'revert', reason: 'SPL', raw: '' })
  assert.match(other.message, /"SPL"/)
  const empty = explainFailure(ctxFor(), { type: 'revert', reason: null, raw: 'execution reverted' })
  assert.match(empty.message, /without giving a reason/)
  assert.equal(classifyCallFailure(new Error('execution reverted')).type, 'revert')
})

test('diagnostics list the stage, revert reason, amounts, allowance, minimum received and deadline', () => {
  const lines = buildDiagnostics(ctxFor({ allowance: 5_000n, balance: 50_000n }), { type: 'revert', reason: 'STF', raw: 'execution reverted: STF' }).join('\n')
  for (const needle of ['eth_call', '0x5ae401dc', 'Revert reason: STF', 'Amount in: 0.01 USDC', 'Allowance to router: 0.005 USDC', 'Minimum received: 0.008884 EURC', 'Deadline: 2030-03-17', 'EVM revert', UNISWAP_V3.swapRouter02]) {
    assert.ok(lines.includes(needle), `missing "${needle}" in:\n${lines}`)
  }
  const rpcLines = buildDiagnostics(ctxFor(), { type: 'rpc', raw: 'rate limit exceeded' }).join('\n')
  assert.ok(rpcLines.includes('RPC problem (not a revert)') && rpcLines.includes('rate limit exceeded'))
})

/* ---------- amounts ---------- */

test('amount parsing and formatting never lose precision', () => {
  assert.equal(parseTokenInput('1.5', 6), 1_500_000n)
  assert.equal(parseTokenInput('0.00000001', 8), 1n)
  assert.equal(parseTokenInput('', 6), null)
  assert.equal(parseTokenInput('.', 6), null)
  assert.equal(sanitizeTokenInput('1.2.3abc', 6), '1.23')
  assert.equal(sanitizeTokenInput('0.1234567', 6), '0.123456')
  assert.equal(sanitizeTokenInput('007', 6), '7')
  assert.equal(formatTokenAmount(1_234_567_890n, USDC, 6), '1,234.56789')
  assert.equal(formatTokenAmount(1n, USDC, 6), '0.000001')
  assert.equal(formatTokenAmount(1n, WETH, 6), '<0.000001')
  const rate = exchangeRate(10_000_000n, 8_929_277n, USDC, EURC)
  assert.ok(rate !== null && Math.abs(rate - 0.8929277) < 1e-9)
  assert.equal(formatRate(0.8929277), '0.8929')
  assert.equal(exchangeRate(0n, 1n, USDC, EURC), null)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
