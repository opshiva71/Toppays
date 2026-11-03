/**
 * Read-only audit of the direct Uniswap V3 integration on Arc Mainnet. No API, no key, no transaction.
 *
 *   bun run verify:uniswap
 *
 * It checks that the contracts exist and are wired together, lists the pools and fee tiers that exist,
 * fetches live QuoterV2 prices through the same code the app uses, and confirms that simulations and
 * limits behave. Everything it reads comes from the Arc RPC.
 */
import { erc20Abi, getAddress, type Address } from 'viem'
import { SWAP_TOKENS, UNISWAP_V3, V3_FEE_TIERS } from '../config/uniswap'
import { publicClient } from '../src/services/rpc'
import { verifySwapContracts, formatTokenAmount } from '../src/services/swapTokens'
import {
  buildSwapCall,
  describeRoute,
  discoverPools,
  fetchQuote,
  readAllowance,
  simulateSwap,
  SwapError,
  tokenBySymbol,
  type SwapQuoteView,
} from '../src/services/uniswap'

const FUNDED: Address = getAddress('0xB6150A23b84ae28aE368c1BbF33B6e7A253da0B4') // public address with real USDC on Arc; read-only here
let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

// 1. Contracts, wiring, interfaces, tokens
const verification = await verifySwapContracts()
for (const item of verification.checks) check(`onchain: ${item.label}`, item.state === 'ok', `${item.address} ${item.detail}`)

// 2. Pools and fee tiers that exist right now
const symbols = SWAP_TOKENS.map((token) => token.symbol)
const pairs: [(typeof SWAP_TOKENS)[number], (typeof SWAP_TOKENS)[number]][] = []
for (let i = 0; i < SWAP_TOKENS.length; i += 1) for (let j = i + 1; j < SWAP_TOKENS.length; j += 1) pairs.push([SWAP_TOKENS[i], SWAP_TOKENS[j]])
const pools = await discoverPools(pairs)
let liveSeen = 0
for (const [a, b] of pairs) {
  const key = [a.address, b.address].map((x) => x.toLowerCase()).sort().join(':')
  const list = pools.get(key) ?? []
  const live = list.filter((pool) => pool.liquidity > 0n)
  liveSeen += live.length
  const tiers = list.map((pool) => `${pool.fee / 10000}%${pool.liquidity > 0n ? '' : '(empty)'}`).join(' ')
  console.log(`      pools ${a.symbol}/${b.symbol}: ${list.length ? tiers : 'none'}`)
}
check('Uniswap V3 pools with liquidity exist on Arc', liveSeen >= 5, `${liveSeen} pools with liquidity across ${symbols.join(', ')}; tiers ${V3_FEE_TIERS.join('/')}`)

// 3. Live quotes through the app's own engine
const cases: [string, string, string][] = [
  ['USDC', 'EURC', '10'],
  ['EURC', 'USDC', '5'],
  ['USDC', 'cirBTC', '10'],
  ['cirBTC', 'USDC', '0.0001'],
  ['USDC', 'WETH', '10'],
  ['WETH', 'USDC', '0.002'],
  ['EURC', 'cirBTC', '5'],
  ['cirBTC', 'WETH', '0.0005'],
]
const quotes = new Map<string, SwapQuoteView>()
for (const [from, to, amount] of cases) {
  const tokenIn = tokenBySymbol(from)
  const tokenOut = tokenBySymbol(to)
  const [whole = '0', fraction = ''] = amount.split('.')
  const amountIn = BigInt(whole + fraction.padEnd(tokenIn.decimals, '0').slice(0, tokenIn.decimals))
  try {
    const quote = await fetchQuote({ tokenIn, tokenOut, amountIn, swapper: FUNDED, slippage: 0.5 })
    quotes.set(`${from}>${to}`, quote)
    const ok = quote.amountOut > 0n && quote.minOut < quote.amountOut && quote.priceImpact >= 0 && quote.priceImpact < 5 && quote.gasEstimate > 0n
    check(`live quote ${amount} ${from} → ${to}`, ok, `${formatTokenAmount(quote.amountOut, tokenOut, 8)} ${to} via ${describeRoute(quote.route)}, min ${formatTokenAmount(quote.minOut, tokenOut, 8)}, impact ${quote.priceImpact.toFixed(3)}%, ~${quote.gasEstimate} gas`)
  } catch (error) {
    check(`live quote ${amount} ${from} → ${to}`, false, (error as Error).message)
  }
}

// 4. Failure handling
try {
  const huge = await fetchQuote({ tokenIn: tokenBySymbol('USDC'), tokenOut: tokenBySymbol('cirBTC'), amountIn: 10n ** 18n, swapper: FUNDED, slippage: 0.5 })
  check('absurdly large trade shows a very high price impact (the app then needs an extra confirmation)', huge.priceImpact >= 5, `impact ${huge.priceImpact.toFixed(1)}%`)
} catch (error) {
  check('absurdly large trade is rejected with a clear error', error instanceof SwapError && error.kind === 'no-route', (error as Error).message)
}
try {
  await fetchQuote({ tokenIn: { symbol: 'FAKE', name: 'Fake', address: getAddress('0x00000000000000000000000000000000000000aa'), decimals: 18 }, tokenOut: tokenBySymbol('USDC'), amountIn: 1n, swapper: FUNDED, slippage: 0.5 })
  check('unsupported token is rejected', false)
} catch (error) {
  check('unsupported token is rejected', error instanceof SwapError && error.kind === 'invalid', (error as Error).message)
}

// 5. Simulation guards the wallet: without an approval the router cannot take the tokens, so the swap is stopped
const usdcEurc = quotes.get('USDC>EURC')
if (usdcEurc) {
  const allowance = await readAllowance(FUNDED, usdcEurc.params.tokenIn)
  console.log(`      current USDC allowance of the sample address for SwapRouter02: ${allowance}`)
  try {
    await simulateSwap(FUNDED, buildSwapCall(usdcEurc), usdcEurc)
    check('simulation without allowance is stopped', allowance >= usdcEurc.params.amountIn, 'simulation passed because an allowance already exists')
  } catch (error) {
    check('simulation without allowance is stopped before the wallet', error instanceof SwapError && error.kind === 'simulation', (error as Error).message)
  }
  console.log(`      router ${UNISWAP_V3.swapRouter02}, quoter ${UNISWAP_V3.quoterV2}, factory ${UNISWAP_V3.factory}`)
}

// 6. The exact swap transaction is simulated on the REAL chain for real holders that already approved the router.
//    This is the path that failed for a user; it proves the calldata, router, fee tier and deadline are valid on Arc.
const HOLDERS: Address[] = [
  '0xA7CD8B3E37F626108457541539AE212cCc6459C8',
  '0xE70D8B99FD1B012e731761F0444Efc7C3445bEf6',
  '0xE4A5fBeaa2732C9D0E24A1D5650317495c89075b',
  '0xe22615dF05100Dd164130cC8CdaCB7Afd5C1Eb40',
]
let simulated = false
const usdcToken = tokenBySymbol('USDC')
for (const holder of HOLDERS) {
  const amount = 100_000n // 0.1 USDC
  const [allowance, balance] = await Promise.all([
    readAllowance(holder, usdcToken),
    publicClient.readContract({ address: usdcToken.address, abi: erc20Abi, functionName: 'balanceOf', args: [holder] }),
  ])
  if (allowance < amount || balance < amount) continue
  const quote = await fetchQuote({ tokenIn: usdcToken, tokenOut: tokenBySymbol('EURC'), amountIn: amount, swapper: holder, slippage: 0.5 })
  try {
    const gas = await simulateSwap(holder, buildSwapCall(quote), quote)
    check(`REAL-CHAIN simulation passes for a holder with allowance (${holder.slice(0, 8)}…): 0.1 USDC → EURC, gas ${gas}`, true)
  } catch (error) {
    check('REAL-CHAIN simulation passes for a holder with allowance', false, (error as Error).message)
  }
  simulated = true
  break
}
if (!simulated) console.log('SKIP  no sample holder currently has both balance and allowance; the fork test covers this path')

console.log(failures === 0 ? '\nAll checks passed. Nothing was sent to the network.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
