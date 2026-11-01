/**
 * Pure send-flow logic: input validation and quote building. Nothing here
 * signs or submits a transaction.
 */

import { getAddress, isAddress, zeroAddress, type Address } from 'viem'
import { AmountError, parseAmount, usdcToGasToken, type Amount } from '@/onchain-money'
import { ARC_MAINNET_CHAIN_ID, ARC_SYSTEM_TRANSFER_EMITTER, ARC_USDC, MIN_MAX_FEE_PER_GAS } from '../../config/network'
import { publicClient, withRpcRetry } from './rpc'
import { classifyError } from './errors'

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
  to: Address
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

export async function buildQuote(params: { from: Address; to: Address; amount: Amount }): Promise<SendQuote> {
  const { from, to, amount } = params
  const valueNative = usdcToGasToken(ARC_MAINNET_CHAIN_ID, amount).raw

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
    gas = await withRpcRetry(() => publicClient.estimateGas({ account: from, to, value: valueNative }))
  } catch (error) {
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
  const paddedGas = (gas * 110n) / 100n
  const maxFeeNative = paddedGas * fees.maxFeePerGas
  if (nativeBalance < valueNative + maxFeeNative) {
    throw new QuoteError(
      'insufficient-gas',
      'Insufficient USDC for the network fee on top of this amount. Lower the amount or add funds.',
    )
  }

  return {
    from,
    to,
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
