/**
 * Executes the full swap flow (exact approval, simulation, swap) against a LOCAL fork of Arc Mainnet.
 * No real transaction is sent: the fork is a throwaway copy of chain state on your machine, and the script
 * refuses to run against anything but 127.0.0.1.
 *
 * Use Arc's own Foundry build so Arc's native-USDC and blocklist precompiles exist on the fork:
 *   https://docs.arc.io/arc/tutorials/install-arc-foundry.md
 *   arc-anvil --network arc --fork-url https://rpc.mainnet.arc.io --port 8599
 *   bun run test:swap-fork
 *
 * Quotes come from real Arc Mainnet; only the transactions run on the fork. A stock anvil cannot move USDC
 * or the Circle tokens (their transfers call Arc precompiles), so it cannot run this test.
 */
import { createPublicClient, createWalletClient, custom, encodeFunctionData, erc20Abi, formatUnits, http, type Address } from 'viem'
import { UNISWAP_V3 } from '../config/uniswap'
import { buildExactApproval, buildSwapCall, describeRoute, fetchQuote, tokenBySymbol, type SwapQuoteView } from '../src/services/uniswap'

const FORK = process.env.FORK_RPC ?? 'http://127.0.0.1:8599'
const ACCOUNT: Address = '0xB6150A23b84ae28aE368c1BbF33B6e7A253da0B4' // public address with real USDC on Arc; impersonated on the fork only

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(FORK)) {
  console.error('Refusing to run: FORK_RPC must be a local anvil fork (127.0.0.1).')
  process.exit(2)
}

const fork = createPublicClient({ transport: http(FORK) })
let failures = 0
const report = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const json = (await response.json()) as { result?: unknown; error?: { message: string } }
  if (json.error) throw new Error(json.error.message)
  return json.result
}

const wallet = createWalletClient({
  account: ACCOUNT,
  transport: custom({ request: ({ method, params }) => rpc(String(method), (params as unknown[]) ?? []) as Promise<never> }),
})

const balanceOf = (symbol: string): Promise<bigint> =>
  fork.readContract({ address: tokenBySymbol(symbol).address, abi: erc20Abi, functionName: 'balanceOf', args: [ACCOUNT] })

async function send(label: string, tx: { to: Address; data: `0x${string}` }): Promise<'success' | 'reverted'> {
  const hash = await wallet.sendTransaction({ chain: null, to: tx.to, data: tx.data, value: 0n, gas: 1_500_000n, maxFeePerGas: 40_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n })
  const receipt = await fork.waitForTransactionReceipt({ hash })
  console.log(`      ${label}: ${receipt.status} (gas ${receipt.gasUsed})`)
  return receipt.status
}

async function swapCase(symbolIn: string, symbolOut: string, amountText: string, expectLabel: string) {
  const tokenIn = tokenBySymbol(symbolIn)
  const tokenOut = tokenBySymbol(symbolOut)
  const amountIn = BigInt(Math.round(Number(amountText) * 10 ** tokenIn.decimals))
  const have = await balanceOf(symbolIn)
  if (have < amountIn) return report(`${symbolIn} → ${symbolOut}`, false, `fork account only has ${formatUnits(have, tokenIn.decimals)} ${symbolIn}`)
  let quote: SwapQuoteView
  try {
    quote = await fetchQuote({ tokenIn, tokenOut, amountIn, swapper: ACCOUNT, slippage: 0.5 })
  } catch (error) {
    return report(`${symbolIn} → ${symbolOut}`, false, `quote failed: ${(error as Error).message}`)
  }
  report(`quote ${amountText} ${symbolIn} → ${symbolOut}`, quote.amountOut > 0n && describeRoute(quote.route).includes(expectLabel), `${formatUnits(quote.amountOut, tokenOut.decimals)} via ${describeRoute(quote.route)}, impact ${quote.priceImpact.toFixed(3)}%`)

  // Exact approval, never unlimited.
  const approval = buildExactApproval(tokenIn, amountIn)
  const approveStatus = await send('approve', approval)
  const allowance = await fork.readContract({ address: tokenIn.address, abi: erc20Abi, functionName: 'allowance', args: [ACCOUNT, UNISWAP_V3.swapRouter02] })
  report(`${symbolIn} approval is exactly the swap amount`, approveStatus === 'success' && allowance === amountIn, `allowance ${allowance}`)

  const before = await balanceOf(symbolOut)
  const call = buildSwapCall(quote)
  const status = await send('swap', call)
  const after = await balanceOf(symbolOut)
  const received = after - before
  report(`${symbolIn} → ${symbolOut} swap executes on the fork`, status === 'success')
  report(`received at least the minimum`, status === 'success' && received >= quote.minOut, `received ${formatUnits(received, tokenOut.decimals)}, minimum ${formatUnits(quote.minOut, tokenOut.decimals)}`)
  const drift = quote.amountOut > 0n ? Number(((received > quote.amountOut ? received - quote.amountOut : quote.amountOut - received) * 10_000n) / quote.amountOut) / 100 : 100
  report(`received amount matches the quote`, status === 'success' && drift < 0.5, `drift ${drift.toFixed(3)}%`)
}

/** A stock anvil has no Arc native-USDC precompile, so USDC transfers revert on it. Detect that up front. */
async function usdcTransfersWork(): Promise<boolean> {
  try {
    const hash = await wallet.sendTransaction({
      chain: null,
      to: tokenBySymbol('USDC').address,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: ['0xe317C9F35CE70f8E90e0fd881b0eeb34941D6Ea1', 1n] }),
      gas: 300_000n,
      maxFeePerGas: 40_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    })
    return (await fork.waitForTransactionReceipt({ hash })).status === 'success'
  } catch {
    return false
  }
}

/** Gives the impersonated account some of a token by moving it out of a pool, on the fork only. */
async function fundFromPool(symbol: string, pool: Address, amount: bigint) {
  const token = tokenBySymbol(symbol)
  await rpc('anvil_setBalance', [pool, '0x56bc75e2d63100000'])
  await rpc('anvil_impersonateAccount', [pool])
  const poolWallet = createWalletClient({ account: pool, transport: custom({ request: ({ method, params }) => rpc(String(method), (params as unknown[]) ?? []) as Promise<never> }) })
  const hash = await poolWallet.sendTransaction({
    chain: null,
    to: token.address,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [ACCOUNT, amount] }),
    gas: 300_000n,
    maxFeePerGas: 40_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  })
  await fork.waitForTransactionReceipt({ hash })
}

try {
  const chainId = await fork.getChainId()
  report('local fork is reachable and reports chain 5042', chainId === 5042, `chainId ${chainId}`)
  await rpc('anvil_impersonateAccount', [ACCOUNT])

  const usdcOk = await usdcTransfersWork()
  if (!usdcOk) {
    console.log('SKIP  USDC pairs: this fork cannot move USDC. Start it with arc-anvil --network arc (Arc Foundry); stock anvil lacks Arc precompiles.')
  } else {
    await swapCase('USDC', 'EURC', '5', 'USDC → EURC')
    await swapCase('USDC', 'cirBTC', '5', 'USDC → cirBTC')
    await swapCase('USDC', 'WETH', '5', 'USDC → WETH')
    await swapCase('EURC', 'cirBTC', '1', 'EURC → USDC → cirBTC') // two hops
    await swapCase('EURC', 'USDC', '1', 'EURC → USDC')
  }

  // cirBTC/WETH is a direct pool that never touches USDC, so the full flow can run on a stock fork.
  await fundFromPool('cirBTC', '0xBb505c923D0CE6364b6d1769Fd85Bd62B0C0E9C9', 200_000n) // 0.002 cirBTC
  await swapCase('cirBTC', 'WETH', '0.0005', 'cirBTC → WETH')
  await swapCase('WETH', 'cirBTC', '0.001', 'WETH → cirBTC')
} catch (error) {
  failures += 1
  console.log('FAIL  unexpected error:', (error as Error).message)
}

console.log(failures === 0 ? '\nAll fork checks passed (local fork only; no real transaction was sent).' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
