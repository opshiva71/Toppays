/**
 * Routing a payment through the deployed TopPay contract: `send(recipient, memo)` forwards 100% of the
 * value to the recipient in the same transaction and logs a `Payment` receipt. Pure helpers plus the
 * one-time contract verification. Nothing here signs or submits a transaction.
 */

import { decodeErrorResult, decodeFunctionData, encodeFunctionData, hexToString, stringToBytes, stringToHex, zeroHash, type Address, type Hex } from 'viem'
import { TOPPAY_ABI } from '../../config/abi'
import { TOPPAY_CONTRACT, verifyTopPayContract, type ContractVerification } from '../../config/contract'
import { findRevertData } from './uniswap'
import { publicClient } from './rpc'

export const MEMO_MAX_BYTES = 32

export type MemoResult = { ok: true; hex: Hex; text: string } | { ok: false; message: string }

/** The memo is public onchain. It is stored as bytes32: UTF-8 text up to 32 bytes, zero-padded. Empty means "no memo". */
export function encodeMemo(input: string): MemoResult {
  const text = input.trim()
  if (!text) return { ok: true, hex: zeroHash, text: '' }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) return { ok: false, message: 'The memo cannot contain control characters.' }
  const bytes = stringToBytes(text).length
  if (bytes > MEMO_MAX_BYTES) return { ok: false, message: `The memo is ${bytes} bytes. The limit is ${MEMO_MAX_BYTES} bytes (about 32 plain letters).` }
  return { ok: true, hex: stringToHex(text, { size: 32 }), text }
}

/** Reads a bytes32 memo back to text. Returns null for "no memo" or anything that is not clean readable text. */
export function decodeMemo(hex: Hex | undefined | null): string | null {
  if (!hex || hex === zeroHash) return null
  try {
    const text = hexToString(hex, { size: 32 }).replace(/\u0000+$/g, '')
    // eslint-disable-next-line no-control-regex
    if (!text || /[\u0000-\u001f\u007f\ufffd]/.test(text)) return null
    return text
  } catch {
    return null
  }
}

/** The exact calldata for `send(recipient, memo)`. */
export function buildPaymentCall(recipient: Address, memo: Hex): Hex {
  return encodeFunctionData({ abi: TOPPAY_ABI, functionName: 'send', args: [recipient, memo] })
}

export interface PaymentTx {
  to: Address
  data: Hex
  value: bigint
}

/**
 * Last line of defence before the wallet is asked: the transaction must go to the verified contract,
 * call `send` with exactly the recipient and memo that were reviewed, and carry exactly the reviewed value.
 */
export function assertPaymentTx(tx: PaymentTx, expected: { contract: Address; recipient: Address; memo: Hex; value: bigint }): void {
  if (tx.to.toLowerCase() !== expected.contract.toLowerCase()) throw new Error('The payment would go to a different contract than the one you reviewed. It was not sent.')
  if (tx.value !== expected.value) throw new Error('The payment value does not match the amount you reviewed. It was not sent.')
  let decoded: { functionName: string; args?: readonly unknown[] }
  try {
    decoded = decodeFunctionData({ abi: TOPPAY_ABI, data: tx.data })
  } catch {
    throw new Error('The payment data is not a valid TopPay send call. It was not sent.')
  }
  const [recipient, memo] = (decoded.args ?? []) as [Address, Hex]
  if (decoded.functionName !== 'send' || recipient?.toLowerCase() !== expected.recipient.toLowerCase() || memo?.toLowerCase() !== expected.memo.toLowerCase()) {
    throw new Error('The payment data does not match the recipient or memo you reviewed. It was not sent.')
  }
}

/** Plain-language reason for a TopPay custom error found in a failed simulation, or null if it is not one. */
export function explainTopPayRevert(error: unknown): string | null {
  const data = findRevertData(error)
  if (!data) return null
  try {
    const decoded = decodeErrorResult({ abi: TOPPAY_ABI, data })
    switch (decoded.errorName) {
      case 'TransferFailed':
        return 'The recipient cannot receive this payment. Arc rejects USDC to some addresses (for example blocklisted ones), and a contract that refuses USDC also fails. Nothing was sent.'
      case 'ZeroAddress':
        return 'The recipient is the zero address. Nothing was sent.'
      case 'SelfTarget':
        return 'The recipient is the TopPay contract itself, which cannot be paid. Nothing was sent.'
      case 'ZeroAmount':
        return 'The amount is zero. Nothing was sent.'
      case 'ReentrantCall':
        return 'The recipient tried to call back into TopPay, which is blocked. Nothing was sent.'
      default: {
        // viem also decodes the standard Error(string) and Panic(uint256) reverts; those are not TopPay errors,
        // so the caller falls back to its generic explanation.
        const name: string = decoded.errorName
        if (name === 'Error' || name === 'Panic') return null
        return `The TopPay contract rejected the payment (${name}). Nothing was sent.`
      }
    }
  } catch {
    return null
  }
}

export type PaymentRoute =
  | { mode: 'direct' }
  | { mode: 'contract'; contract: Address }

const VERIFY_TTL_MS = 5 * 60_000
let verified: { address: Address; at: number } | null = null

/**
 * Decides how a payment is sent. No contract configured: a plain direct transfer. A contract configured:
 * the payment is routed through it, but only after it is checked onchain (code present and the TopPay
 * identifier returned). A configured contract that fails the check pauses sending instead of silently
 * falling back, so payments never go somewhere you did not choose.
 */
export async function resolvePaymentRoute(): Promise<PaymentRoute> {
  if (TOPPAY_CONTRACT.state === 'not-configured') return { mode: 'direct' }
  if (TOPPAY_CONTRACT.state === 'invalid') throw new Error(`${TOPPAY_CONTRACT.reason} Sending is paused until the setting is fixed.`)

  const address = TOPPAY_CONTRACT.address
  if (verified && verified.address === address && Date.now() - verified.at < VERIFY_TTL_MS) return { mode: 'contract', contract: address }

  const result: ContractVerification = await verifyTopPayContract(publicClient)
  if (result.state === 'verified') {
    verified = { address, at: Date.now() }
    return { mode: 'contract', contract: address }
  }
  const why =
    result.state === 'no-code'
      ? 'there is no contract at that address'
      : result.state === 'wrong-contract'
        ? 'it is not a TopPay v2 contract'
        : 'the Arc RPC did not answer'
  throw new Error(`The TopPay payments contract could not be verified (${why}), so sending is paused for safety. Try again in a moment.`)
}
