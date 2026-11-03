/**
 * Live, read-only test of the shared Arc RPC transport (burst smoothing, failover, wrong-chain refusal).
 * It reproduces the production failure: the public endpoint answers "rate limit exceeded" to bursts, which
 * used to make swap simulations (eth_call / eth_estimateGas) fail and be misreported.
 *
 *   bun run test:rpc
 *
 * No transaction is sent. Child runs change only the primary endpoint through VITE_ARC_RPC_URL.
 */
import { execFileSync } from 'node:child_process'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { createPublicClient, http } from 'viem'
import { arcMainnet } from '../config/network'
import { publicClient } from '../src/services/rpc'

const mode = process.argv[2]
const BURST = 80
const addresses = () => Array.from({ length: BURST }, () => privateKeyToAddress(generatePrivateKey()))

if (mode === 'burst') {
  const results = await Promise.allSettled(addresses().map((address) => publicClient.getBalance({ address })))
  console.log(JSON.stringify({ ok: results.filter((r) => r.status === 'fulfilled').length, failed: results.filter((r) => r.status === 'rejected').length }))
  process.exit(0)
}
if (mode === 'chain') {
  console.log(String(await publicClient.request({ method: 'eth_chainId' })))
  process.exit(0)
}

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const child = (arg: string, env: Record<string, string> = {}): string => {
  const lines = execFileSync('bun', ['run', 'scripts/test-rpc.ts', arg], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120_000 }).trim().split('\n')
  return lines[lines.length - 1] ?? ''
}

// 1. Baseline: what the app used to do (plain http, no smoothing) is rate limited by the public endpoint
const plain = createPublicClient({ chain: arcMainnet, transport: http('https://rpc.mainnet.arc.io', { retryCount: 0 }) })
const baseline = await Promise.allSettled(addresses().map((address) => plain.getBalance({ address })))
const baselineFailed = baseline.filter((r) => r.status === 'rejected').length
console.log(`      plain burst of ${BURST}: ${baseline.length - baselineFailed} ok, ${baselineFailed} rate limited`)
check('baseline reproduces the production problem (a plain burst gets rate limited)', baselineFailed > 0, `${baselineFailed}/${BURST} failed`)
await new Promise((resolve) => setTimeout(resolve, 8_000))

// 2. The shared transport absorbs the same burst
const smoothed = JSON.parse(child('burst')) as { ok: number; failed: number }
check(`the app transport completes the same ${BURST}-call burst`, smoothed.failed === 0 && smoothed.ok === BURST, JSON.stringify(smoothed))
await new Promise((resolve) => setTimeout(resolve, 8_000))

// 3. Failover: a dead primary endpoint does not stop reads
const dead = JSON.parse(child('burst', { VITE_ARC_RPC_URL: 'https://127.0.0.1:9' })) as { ok: number; failed: number }
check('a dead primary falls over to the official endpoints', dead.failed === 0 && dead.ok === BURST, JSON.stringify(dead))

// 4. An endpoint that is not chain 5042 is never used
const wrong = child('chain', { VITE_ARC_RPC_URL: 'https://mainnet.base.org' })
check('a wrong-chain endpoint (Base) is refused; answers still come from chain 5042', wrong === '0x13b2', wrong)

console.log(failures === 0 ? '\nAll RPC checks passed. Nothing was sent to the network.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
