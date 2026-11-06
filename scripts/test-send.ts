/**
 * Offline tests for sending through the TopPay contract: memo encoding, calldata, the pre-signing check,
 * error explanations and the history mapping. No network access, no transactions.
 * Run with: bun run test:send  (the script sets VITE_TOPPAY_CONTRACT_ADDRESS for the address checks).
 */
import assert from 'node:assert/strict'
import { encodeErrorResult, getAddress, toFunctionSelector, zeroHash, type Hash, type Hex } from 'viem'
import { TOPPAY_ABI } from '../config/abi'

let passed = 0
let failed = 0
function test(name: string, run: () => void | Promise<void>) {
  return Promise.resolve()
    .then(run)
    .then(() => {
      passed += 1
      console.log(`PASS  ${name}`)
    })
    .catch((error: unknown) => {
      failed += 1
      console.log(`FAIL  ${name}\n      ${error instanceof Error ? error.message : String(error)}`)
    })
}

const CONTRACT = getAddress('0x6C24c5cFcB3Dc21509623B321508956300393c04')
const ME = getAddress('0xB6150A23b84ae28aE368c1BbF33B6e7A253da0B4')
const RECIPIENT = getAddress('0xe317C9F3F0a3d3d6a9b4b1b3b3c3f4C2f6ee4a3b'.toLowerCase())
const OTHER = getAddress('0x1788c5E34d92d332a8642Ba5F1C5FE0C7d7c72b1')

const { encodeMemo, decodeMemo, buildPaymentCall, assertPaymentTx, explainTopPayRevert, MEMO_MAX_BYTES } = await import('../src/services/toppayPayment')
const { applyPayments } = await import('../src/services/history')
const { validateRecipient, validateMemo } = await import('../src/services/send')
const { TOPPAY_CONTRACT } = await import('../config/contract')

await test('the contract address is read from the environment', () => {
  assert.equal(TOPPAY_CONTRACT.state, 'configured')
  assert.equal(TOPPAY_CONTRACT.address, CONTRACT)
})

await test('memo: empty means none, text is zero padded to 32 bytes', () => {
  const none = encodeMemo('')
  assert.ok(none.ok && none.hex === zeroHash && none.text === '')
  const memo = encodeMemo('Invoice 104')
  assert.ok(memo.ok)
  if (memo.ok) {
    assert.equal(memo.hex.length, 2 + 64)
    assert.ok(memo.hex.startsWith('0x496e766f6963652031303400'))
    assert.equal(decodeMemo(memo.hex), 'Invoice 104')
  }
})

await test('memo: 32 bytes fits, 33 bytes and control characters are refused', () => {
  assert.ok(encodeMemo('a'.repeat(MEMO_MAX_BYTES)).ok)
  const long = encodeMemo('a'.repeat(MEMO_MAX_BYTES + 1))
  assert.ok(!long.ok && /33 bytes/.test(long.message))
  assert.ok(!encodeMemo('line\nbreak').ok)
  // multi-byte characters count as bytes, not letters
  assert.ok(!encodeMemo('€'.repeat(11)).ok)
  assert.ok(encodeMemo('€'.repeat(10)).ok)
  assert.ok(!validateMemo('x'.repeat(40)).ok)
})

await test('memo: decoding never invents text', () => {
  assert.equal(decodeMemo(zeroHash), null)
  assert.equal(decodeMemo(undefined), null)
  assert.equal(decodeMemo(('0x' + 'ff'.repeat(32)) as Hex), null)
})

await test('calldata is exactly send(recipient, memo)', () => {
  const memo = encodeMemo('hello')
  assert.ok(memo.ok)
  if (!memo.ok) return
  const data = buildPaymentCall(RECIPIENT, memo.hex)
  assert.equal(data.slice(0, 10), toFunctionSelector('send(address,bytes32)'))
  assert.equal(data.length, 2 + 8 + 64 + 64)
})

await test('pre-signing check passes for the reviewed payment', () => {
  const memo = encodeMemo('hello')
  if (!memo.ok) throw new Error('memo')
  const data = buildPaymentCall(RECIPIENT, memo.hex)
  assertPaymentTx({ to: CONTRACT, data, value: 10n ** 16n }, { contract: CONTRACT, recipient: RECIPIENT, memo: memo.hex, value: 10n ** 16n })
})

await test('pre-signing check blocks a changed contract, value, recipient, memo or garbage data', () => {
  const memo = encodeMemo('hello')
  if (!memo.ok) throw new Error('memo')
  const data = buildPaymentCall(RECIPIENT, memo.hex)
  const expected = { contract: CONTRACT, recipient: RECIPIENT, memo: memo.hex, value: 10n ** 16n }
  assert.throws(() => assertPaymentTx({ to: OTHER, data, value: 10n ** 16n }, expected), /different contract/)
  assert.throws(() => assertPaymentTx({ to: CONTRACT, data, value: 10n ** 16n + 1n }, expected), /amount/)
  assert.throws(() => assertPaymentTx({ to: CONTRACT, data: buildPaymentCall(OTHER, memo.hex), value: 10n ** 16n }, expected), /recipient or memo/)
  const other = encodeMemo('other')
  if (!other.ok) throw new Error('memo')
  assert.throws(() => assertPaymentTx({ to: CONTRACT, data: buildPaymentCall(RECIPIENT, other.hex), value: 10n ** 16n }, expected), /recipient or memo/)
  assert.throws(() => assertPaymentTx({ to: CONTRACT, data: '0xdeadbeef', value: 10n ** 16n }, expected), /not a valid TopPay send call/)
})

await test('contract errors are explained in plain language', () => {
  const failedTransfer = encodeErrorResult({ abi: TOPPAY_ABI, errorName: 'TransferFailed', args: [RECIPIENT, 1n] })
  assert.match(explainTopPayRevert({ cause: { data: failedTransfer } }) ?? '', /recipient cannot receive/)
  const self = encodeErrorResult({ abi: TOPPAY_ABI, errorName: 'SelfTarget' })
  assert.match(explainTopPayRevert({ data: self }) ?? '', /TopPay contract itself/)
  assert.equal(explainTopPayRevert(new Error('rate limit exceeded')), null)
  assert.equal(explainTopPayRevert({ data: '0x08c379a0' + '00'.repeat(64) }), null)
})

await test('recipient: the TopPay contract itself cannot be paid', () => {
  const result = validateRecipient(CONTRACT, ME)
  assert.ok(!result.ok && /TopPay payments contract/.test(result.message))
  assert.ok(validateRecipient(RECIPIENT, ME).ok)
})

function entry(partial: Partial<import('../src/services/history').HistoryEntry> & { txHash: Hash }) {
  return {
    id: `${partial.txHash}:0`,
    logIndex: 0,
    blockNumber: 1n,
    timestamp: 1,
    direction: 'sent' as const,
    counterparty: CONTRACT,
    amountNative: 10n ** 18n,
    status: 'confirmed' as const,
    ...partial,
  }
}
const TX_A = ('0x' + 'aa'.repeat(32)) as Hash
const TX_B = ('0x' + 'bb'.repeat(32)) as Hash
const MEMO = (encodeMemo('thanks') as { hex: Hex }).hex

await test('history: a routed send shows the real recipient and memo, not the contract', () => {
  const [result] = applyPayments([entry({ txHash: TX_A })], [{ txHash: TX_A, from: ME, to: RECIPIENT, amount: 10n ** 18n, memo: MEMO }], CONTRACT, ME)
  assert.equal(result.counterparty, RECIPIENT)
  assert.equal(result.viaContract, true)
  assert.equal(decodeMemo(result.memo), 'thanks')
})

await test('history: a routed payment you receive shows the real sender', () => {
  const [result] = applyPayments([entry({ txHash: TX_B, direction: 'received' })], [{ txHash: TX_B, from: OTHER, to: ME, amount: 10n ** 18n, memo: zeroHash }], CONTRACT, ME)
  assert.equal(result.counterparty, OTHER)
  assert.equal(result.viaContract, true)
  assert.equal(decodeMemo(result.memo), null)
})

await test('history: nothing is rewritten without a matching receipt (escrow deposits stay as they are)', () => {
  const base = entry({ txHash: TX_A })
  assert.deepEqual(applyPayments([base], [], CONTRACT, ME)[0], base)
  assert.deepEqual(applyPayments([base], [{ txHash: TX_A, from: ME, to: RECIPIENT, amount: 2n * 10n ** 18n, memo: MEMO }], CONTRACT, ME)[0], base)
  assert.deepEqual(applyPayments([base], [{ txHash: TX_B, from: ME, to: RECIPIENT, amount: 10n ** 18n, memo: MEMO }], CONTRACT, ME)[0], base)
  assert.deepEqual(applyPayments([base], [{ txHash: TX_A, from: OTHER, to: RECIPIENT, amount: 10n ** 18n, memo: MEMO }], CONTRACT, ME)[0], base)
})

await test('history: entries that are not with the contract are untouched; each receipt is used once', () => {
  const plain = entry({ txHash: TX_A, counterparty: RECIPIENT })
  assert.deepEqual(applyPayments([plain], [{ txHash: TX_A, from: ME, to: OTHER, amount: 10n ** 18n, memo: MEMO }], CONTRACT, ME)[0], plain)
  const two = [entry({ txHash: TX_A, id: 'x:0', logIndex: 0 }), entry({ txHash: TX_A, id: 'x:1', logIndex: 1 })]
  const mapped = applyPayments(two, [{ txHash: TX_A, from: ME, to: RECIPIENT, amount: 10n ** 18n, memo: MEMO }], CONTRACT, ME)
  assert.equal(mapped.filter((item) => item.viaContract).length, 1)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
