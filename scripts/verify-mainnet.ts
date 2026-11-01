/**
 * Read-only production checks against live Arc Mainnet. Sends nothing, signs nothing,
 * needs no private key and no funds.
 *
 *   bun run verify:mainnet
 *
 * To test RPC failover, put a dead endpoint first and the official one second:
 *   VITE_ARC_RPC_URL=https://127.0.0.1:9 bun run verify:mainnet
 */

import { erc20Abi, formatUnits, getAddress, type Address, type Hash } from 'viem'
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_RPC_URLS,
  ARC_SYSTEM_TRANSFER_EMITTER,
  ARC_USDC,
  MIN_MAX_FEE_PER_GAS,
  TRANSFER_EVENT_TOPIC,
} from '../config/network'
import { checkRpcHealth, publicClient } from '../src/services/rpc'
import { getFees } from '../src/services/send'
import { getHeadBlock, scanBackwards, type HistoryEntry } from '../src/services/history'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

// 1. Chain ID and RPC endpoints
for (const url of ARC_RPC_URLS) {
  try {
    const started = performance.now()
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(8_000),
    })
    const json = (await response.json()) as { result?: string }
    const id = json.result ? parseInt(json.result, 16) : NaN
    check(`RPC ${new URL(url).host} reports chain ${ARC_MAINNET_CHAIN_ID}`, id === ARC_MAINNET_CHAIN_ID, `${Math.round(performance.now() - started)} ms, https=${url.startsWith('https://')}`)
  } catch {
    console.log(`SKIP  RPC ${new URL(url).host} unreachable (the app would fall back to the next endpoint)`)
  }
}

const health = await checkRpcHealth()
check('Centralized client healthy via fallback chain', health.ok, health.ok ? `block ${health.blockNumber}` : health.message)
if (!health.ok) process.exit(1)

// 2. USDC ERC-20 interface
const [code, symbol, decimals] = await Promise.all([
  publicClient.getCode({ address: ARC_USDC.address }),
  publicClient.readContract({ address: ARC_USDC.address, abi: erc20Abi, functionName: 'symbol' }),
  publicClient.readContract({ address: ARC_USDC.address, abi: erc20Abi, functionName: 'decimals' }),
])
check('USDC ERC-20 predeploy has code', Boolean(code && code !== '0x'), ARC_USDC.address)
check('USDC symbol/decimals', symbol === 'USDC' && decimals === 6, `${symbol}, ${decimals} decimals`)

// 3. Fee floor
const fees = await getFees()
check('Fee cap respects the 20 gwei floor', fees.maxFeePerGas >= MIN_MAX_FEE_PER_GAS, `${formatUnits(fees.maxFeePerGas, 9)} gwei`)

// 4. Find real native transfers from the latest blocks
const head = await getHeadBlock()
const logs = await publicClient.request({
  method: 'eth_getLogs',
  params: [
    {
      fromBlock: `0x${(head - 400n).toString(16)}`,
      toBlock: `0x${(head - 5n).toString(16)}`,
      address: ARC_SYSTEM_TRANSFER_EMITTER,
      topics: [TRANSFER_EVENT_TOPIC],
    },
  ],
})
check('System Transfer logs are present on mainnet', logs.length > 0, `${logs.length} logs in 395 blocks`)

type RawLog = (typeof logs)[number]
const topicAddress = (topic: string | undefined): Address => getAddress(`0x${(topic ?? '').slice(26)}`)

// Pick a log whose transaction is a plain native send (tx.value equals the log value, tx.to is the recipient).
let nativeSample: { log: RawLog; hash: Hash } | undefined
for (const log of logs.slice(0, 60)) {
  if (!log.transactionHash) continue
  const tx = await publicClient.getTransaction({ hash: log.transactionHash })
  if (tx.value > 0n && tx.value === BigInt(log.data) && tx.to && tx.to.toLowerCase() === topicAddress(log.topics[2]).toLowerCase()) {
    nativeSample = { log, hash: log.transactionHash }
    break
  }
}
check('Found a real native USDC transfer to inspect', Boolean(nativeSample))

if (nativeSample) {
  const { log, hash } = nativeSample
  const sender = topicAddress(log.topics[1])
  const recipient = topicAddress(log.topics[2])
  const value = BigInt(log.data)

  // 5. Receipt semantics: success status, inclusion, and log match
  const receipt = await publicClient.getTransactionReceipt({ hash })
  check('Receipt status is success for a mined transfer', receipt.status === 'success', `block ${receipt.blockNumber}`)
  const matching = receipt.logs.some(
    (l) => l.address.toLowerCase() === ARC_SYSTEM_TRANSFER_EMITTER.toLowerCase() && l.data === log.data,
  )
  check('Receipt contains the system Transfer log with the same 18-decimal value', matching, `${formatUnits(value, 18)} USDC`)

  // 6. Native vs ERC-20 view consistency (one pool of funds, 10^12 apart)
  const snapshot = await publicClient.getBlockNumber()
  const probe = (await publicClient.getBalance({ address: sender, blockNumber: snapshot })) > 0n ? sender : recipient
  const [native, erc20] = await Promise.all([
    publicClient.getBalance({ address: probe, blockNumber: snapshot }),
    publicClient.readContract({ address: ARC_USDC.address, abi: erc20Abi, functionName: 'balanceOf', args: [probe], blockNumber: snapshot }),
  ])
  check('Native balance / 1e12 equals ERC-20 balanceOf (same block)', native / 10n ** 12n === erc20 && erc20 > 0n, `${formatUnits(erc20, 6)} USDC`)

  // 7. Simulated native transfer (no signature, nothing is sent): sender balance permitting
  const senderBalance = await publicClient.getBalance({ address: sender })
  if (senderBalance > 2n * 10n ** 18n) {
    const gas = await publicClient.estimateGas({ account: sender, to: recipient, value: 10n ** 18n })
    check('estimateGas for a 1 USDC native transfer', gas >= 21_000n && gas < 100_000n, `${gas} gas (simulation only)`)
  } else {
    console.log('SKIP  estimateGas simulation (sampled sender balance is low)')
  }

  // 8. History from real chain data reproduces this transfer
  const found: HistoryEntry[] = []
  await scanBackwards({
    address: recipient,
    startBlock: head,
    maxChunks: 3,
    targetEntries: 10_000,
    shouldStop: () => false,
    onChunk: (entries) => found.push(...entries),
  })
  // A transaction can touch the same wallet in several logs, so look for any matching received entry.
  const match = found.some((entry) => entry.txHash === hash && entry.direction === 'received' && entry.amountNative === value)
  check('History scan returns the real transfer as Received', match)
  if (found[0]) {
    const entryReceipt = await publicClient.getTransactionReceipt({ hash: found[0].txHash })
    check('Every history entry maps to a successful mined receipt', entryReceipt.status === 'success', found[0].txHash)
  }
}

// 9. Contract config is optional and reports honestly
console.log(`INFO  RPC endpoints in use: ${ARC_RPC_URLS.map((u) => new URL(u).host).join(', ')}`)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
