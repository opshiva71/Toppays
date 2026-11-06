/**
 * Live, read-only checks of payments through the deployed TopPay contract on Arc Mainnet.
 * Simulates (eth_estimateGas) only. Nothing is signed or sent.
 * Run with: bun run verify:toppay
 */
import { getAddress, parseUnits } from 'viem'
import { TOPPAY_CONTRACT } from '../config/contract'
import { buildQuote, QuoteError } from '../src/services/send'
import { resolvePaymentRoute } from '../src/services/toppayPayment'
import { parseAmount } from '../src/onchain-money'
import { publicClient } from '../src/services/rpc'

let failed = 0

/** Runs a quote and returns either the quote or the error, with types that stay narrow. */
const attempt = <T,>(run: () => Promise<T>) =>
  run().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
const ok = (name: string, pass: boolean, detail = '') => {
  if (!pass) failed += 1
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

// A funded wallet (read-only: used as the simulated sender), an ordinary recipient, and a contract that rejects USDC.
const SENDER = getAddress('0xB6150A23b84ae28aE368c1BbF33B6e7A253da0B4')
const RECIPIENT = getAddress('0xe317C9F3F0a3d3d6a9b4b1b3b3c3f4C2f6ee4a3b'.toLowerCase())
const REJECTING_CONTRACT = getAddress('0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1')
const amount = parseAmount(5042, '0.01')

ok('contract address is configured', TOPPAY_CONTRACT.state === 'configured', TOPPAY_CONTRACT.address ?? TOPPAY_CONTRACT.state)
const route = await resolvePaymentRoute().catch((error: unknown) => ({ mode: 'error' as const, error }))
ok('contract passes the onchain check, so payments are routed through it', route.mode === 'contract')

const balance = await publicClient.getBalance({ address: SENDER })
if (balance < parseUnits('0.5', 18)) {
  console.log('SKIP  the sample sender wallet has too little USDC for the simulation; skipping routed quotes')
} else {
  const routed = await attempt(() => buildQuote({ from: SENDER, to: RECIPIENT, amount, memo: 'TopPay test' }))
  ok('a routed payment with a memo simulates successfully', routed.ok, routed.ok ? `gas ${routed.value.gas}, tx to ${routed.value.txTo}` : String(routed.error))
  if (routed.ok) {
    const quote = routed.value
    ok('the wallet would be asked to sign a call to the TopPay contract', quote.route === 'contract' && quote.txTo === TOPPAY_CONTRACT.address)
    ok('the recipient and amount are exactly what was reviewed', quote.to === RECIPIENT && quote.valueNative === parseUnits('0.01', 18))
    ok('the memo is carried as bytes32', quote.memoText === 'TopPay test' && quote.memo.length === 66)
    ok('the calldata is send(recipient, memo)', quote.data !== undefined && quote.data.length === 2 + 8 + 128)
  }

  const noMemo = await attempt(() => buildQuote({ from: SENDER, to: RECIPIENT, amount }))
  ok('a routed payment without a memo also simulates', noMemo.ok)

  const rejected = await attempt(() => buildQuote({ from: SENDER, to: REJECTING_CONTRACT, amount, memo: '' }))
  ok(
    'a recipient contract that refuses USDC is stopped with a plain explanation (before the wallet)',
    !rejected.ok && rejected.error instanceof QuoteError && /recipient cannot receive/.test(rejected.error.message),
    !rejected.ok && rejected.error instanceof Error ? rejected.error.message.slice(0, 90) : 'quoted unexpectedly',
  )

  const tooLong = await attempt(() => buildQuote({ from: SENDER, to: RECIPIENT, amount, memo: 'x'.repeat(40) }))
  ok('a memo over 32 bytes is refused', !tooLong.ok && tooLong.error instanceof QuoteError && /32 bytes/.test(tooLong.error.message))
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
