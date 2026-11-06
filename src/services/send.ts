/**
 * Pure send-flow logic: input validation and quote building. Nothing here
 * signs or submits a transaction.
 */

import { getAddress, isAddress, zeroAddress, type Address, type Hex } from 'viem'
import { AmountError, parseAmount, usdcToGasToken, type Amount } from '@/onchain-money'
import { ARC_MAINNET_CHAIN_ID, ARC_SYSTEM_TRANSFER_EMITTER, ARC_USDC, MIN_MAX_FEE_PER_GAS } from '../../config/network'
import { publicClient, withRpcRetry } from './rpc'
import { classifyError } from './errors'
import { TOPPAY_CONTRACT } from '../../config/contract'
import { assertPaymentTx, buildPaymentCall, encodeMemo, explainTopPayRevert, resolvePaymentRoute } from './toppayPayment'

export type Validation<T> = { ok: true; value: T } | { ok: false; message: string; empty?: boolean }

export function validateRecipient(input: string, sender?: Address): Validation<Address> {
  const raw = input.trim()
  if (!raw) return { ok: false, message: 'Enter a recipient address.', empty: true }
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    return { ok: false, message: 'Enter a valid wallet address: 0x followed by 40 characters.' }
  }
  if (!isAddress(raw)) return { ok: false, message: 'This address has an invalid checksum. Check it for typos.' }
  const address = getAddress(raw)
  if (address === zeroAddress) return { ok: false, message: 'You cannot send to the zero address.' }
  if (sender && address === getAddress(sender)) return { ok: false, message: 'You cannot send to your own address.' }
  if (address === getAddress(ARC_USDC.address) || address === getAddress(ARC_SYSTEM_TRANSFER_EMITTER)) {
    return { ok: false, message: 'This is a protocol address, not a wallet. Funds sent here would be lost.' }
  }
  if (TOPPAY_CONTRACT.state === 'configured' && address === TOPPAY_CONTRACT.address) {
    return { ok: false, message: 'This is the TopPay payments contract, not a wallet. Enter the person you want to pay.' }
  }
  return { ok: true, value: address }
}

export function validateAmount(input: string): Validation<Amount> {
  const raw = input.trim()
  if (!raw) return { ok: false, message: 'Enter an amount.', empty: true }
  try {
    const amount = parseAmount(ARC_MAINNET_CHAIN_ID, raw)
    if (!amount.isPositive()) return { ok: false, message: 'Amount must be greater than zero.' }
    return { ok: true, value: amount }
  } catch (error) {
    if (error instanceof AmountError && error.code === 'TOO_MANY_FRACTION_DIGITS') {
      return { ok: false, message: 'USDC supports at most 6 decimal places.' }
    }
    return { ok: false, message: 'Enter a valid number, for example 25 or 12.50.' }
  }
}

/** Allows digits and one dot only, as the user types. */
export function sanitizeAmountInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const [whole, ...rest] = cleaned.split('.')
  return rest.length ? `${whole}.${rest.join('')}` : whole
}

/** Sanity bounds so a faulty or hostile RPC cannot talk the user into an absurd fee. Arc's documented max base fee is 20,000 gwei. */
const MAX_SANE_FEE_PER_GAS = 100_000_000_000_000n
const MAX_SANE_GAS = 1_000_000n

export interface Fees {
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

/** Fee caps for a send. maxFeePerGas is never below Arc's 20 gwei floor or the tx is silently dropped. */
export async function getFees(): Promise<Fees> {
  let maxFee: bigint
  let tip: bigint
  try {
    const estimate = await withRpcRetry(() => publicClient.estimateFeesPerGas())
    maxFee = estimate.maxFeePerGas
    tip = estimate.maxPriorityFeePerGas
  } catch {
    const gasPrice = await withRpcRetry(() => publicClient.getGasPrice())
    maxFee = (gasPrice * 12n) / 10n
    tip = 0n
  }
  if (maxFee < MIN_MAX_FEE_PER_GAS) maxFee = MIN_MAX_FEE_PER_GAS
  if (maxFee > MAX_SANE_FEE_PER_GAS) throw new Error('Fee data from the RPC is outside the expected range.')
  if (tip > maxFee) tip = maxFee
  return { maxFeePerGas: maxFee, maxPriorityFeePerGas: tip }
}

export interface SendQuote {
  from: Address
  /** The recipient: who ends up with the money. */
  to: Address
  /** 'contract': sent through the TopPay contract (it forwards 100% to `to` and logs a receipt). 'direct': a plain transfer. */
  route: 'contract' | 'direct'
  /** What the wallet is asked to sign: the TopPay contract for a routed payment, otherwise the recipient. */
  txTo: Address
  /** Calldata for a routed payment (send(recipient, memo)); undefined for a direct transfer. */
  data?: Hex
  /** The reviewed memo as bytes32 (zero when none) and as text. */
  memo: Hex
  memoText: string
  /** 6-decimal ERC-20 view, as typed by the user. */
  amount: Amount
  /** Same funds in the 18-decimal native view: what is actually sent as the transaction value. */
  valueNative: bigint
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  /** Upper bound of the fee: gas * maxFeePerGas. The real fee is usually lower. */
  maxFeeNative: bigint
  recipientIsContract: boolean
  nativeBalance: bigint
}

export class QuoteError extends Error {
  readonly kind: 'insufficient-funds' | 'insufficient-gas' | 'network' | 'rejected-by-network'
  constructor(kind: QuoteError['kind'], message: string) {
    super(message)
    this.name = 'QuoteError'
    this.kind = kind
  }
}

export function validateMemo(input: string): Validation<string> {
  const result = encodeMemo(input)
  return result.ok ? { ok: true, value: result.text } : { ok: false, message: result.message }
}

export async function buildQuote(params: { from: Address; to: Address; amount: Amount; memo?: string }): Promise<SendQuote> {
  const { from, to, amount } = params
  const valueNative = usdcToGasToken(ARC_MAINNET_CHAIN_ID, amount).raw

  const encoded = encodeMemo(params.memo ?? '')
  if (!encoded.ok) throw new QuoteError('rejected-by-network', encoded.message)

  let route: Awaited<ReturnType<typeof resolvePaymentRoute>>
  try {
    route = await resolvePaymentRoute()
  } catch (error) {
    throw new QuoteError('network', error instanceof Error ? error.message : 'The payments contract could not be checked.')
  }
  const routed = route.mode === 'contract'
  const txTo: Address = route.mode === 'contract' ? route.contract : to
  const data: Hex | undefined = routed ? buildPaymentCall(to, encoded.hex) : undefined
  if (!routed && encoded.text) throw new QuoteError('rejected-by-network', 'A memo needs the TopPay contract, which is not configured. Remove the memo to send directly.')

  let code: string | undefined
  let nativeBalance: bigint
  let fees: Fees
  let rpcChainId: number
  try {
    ;[code, nativeBalance, fees, rpcChainId] = await Promise.all([
      withRpcRetry(() => publicClient.getCode({ address: to })),
      withRpcRetry(() => publicClient.getBalance({ address: from })),
      getFees(),
      withRpcRetry(() => publicClient.getChainId()),
    ])
  } catch {
    throw new QuoteError('network', 'Could not read network state from the Arc RPC. Try again in a moment.')
  }
  if (rpcChainId !== ARC_MAINNET_CHAIN_ID) {
    throw new QuoteError('network', 'The configured RPC is not Arc Mainnet. Sending is blocked until this is fixed.')
  }

  if (nativeBalance < valueNative) {
    throw new QuoteError('insufficient-funds', 'Insufficient USDC balance for this amount.')
  }

  let gas: bigint
  try {
    gas = await withRpcRetry(() => publicClient.estimateGas({ account: from, to: txTo, data, value: valueNative }))
  } catch (error) {
    const routedReason = routed ? explainTopPayRevert(error) : null
    if (routedReason) throw new QuoteError('rejected-by-network', routedReason)
    const classified = classifyError(error)
    if (classified.kind === 'insufficient-funds') {
      throw new QuoteError('insufficient-gas', 'Your balance cannot cover the amount plus the network fee.')
    }
    if (classified.kind === 'network') throw new QuoteError('network', classified.message)
    throw new QuoteError(
      'rejected-by-network',
      'The network would reject this transfer. The recipient or your wallet may be blocklisted, or the recipient contract cannot receive USDC.',
    )
  }

  if (gas > MAX_SANE_GAS) {
    throw new QuoteError('rejected-by-network', 'The gas estimate for this transfer is unexpectedly high. It was not sent.')
  }
  // A routed payment forwards gas to the recipient inside the contract, so it gets a larger margin (63/64 rule).
  const paddedGas = routed ? (gas * 125n) / 100n : (gas * 110n) / 100n
  const maxFeeNative = paddedGas * fees.maxFeePerGas
  if (nativeBalance < valueNative + maxFeeNative) {
    throw new QuoteError(
      'insufficient-gas',
      'Insufficient USDC for the network fee on top of this amount. Lower the amount or add funds.',
    )
  }

  if (routed) {
    // Defence in depth: the exact transaction the wallet will be asked to sign must match what was reviewed.
    assertPaymentTx({ to: txTo, data: data as Hex, value: valueNative }, { contract: txTo, recipient: to, memo: encoded.hex, value: valueNative })
  }

  return {
    from,
    to,
    route: routed ? 'contract' : 'direct',
    txTo,
    data,
    memo: encoded.hex,
    memoText: encoded.text,
    amount,
    valueNative,
    gas: paddedGas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    maxFeeNative,
    recipientIsContract: Boolean(code && code !== '0x'),
    nativeBalance,
  }
}
