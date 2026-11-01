import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useSendTransaction } from 'wagmi'
import type { Hash } from 'viem'
import { ARC_MAINNET_CHAIN_ID, RECEIPT_SETTINGS } from '../../config/network'
import { publicClient } from '@/services/rpc'
import { classifyError } from '@/services/errors'
import { QuoteError, buildQuote, validateAmount, validateRecipient, type SendQuote } from '@/services/send'

export type SendPhase =
  | 'idle'
  | 'quoting'
  | 'review'
  | 'awaiting-wallet'
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'rejected'
  | 'unconfirmed'

export interface SendState {
  phase: SendPhase
  quote?: SendQuote
  hash?: Hash
  blockNumber?: bigint
  message?: string
}

/**
 * Send flow state machine: idle -> quoting -> review -> awaiting-wallet -> pending
 * -> confirmed | failed | unconfirmed. "confirmed" is only ever set from a mined
 * receipt with status "success". A transaction is submitted at most once per
 * review: there is no automatic resubmission anywhere in this hook.
 */
export function useSendUsdc(options: { onConfirmed?: () => void } = {}) {
  const { address, chainId, isConnected } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const [state, setState] = useState<SendState>({ phase: 'idle' })
  const inFlight = useRef(false)
  const onConfirmed = useRef(options.onConfirmed)
  useEffect(() => {
    onConfirmed.current = options.onConfirmed
  })

  const reset = useCallback(() => {
    if (inFlight.current) return
    setState({ phase: 'idle' })
  }, [])

  const backToEdit = useCallback(() => {
    if (inFlight.current) return
    setState({ phase: 'idle' })
  }, [])

  const prepare = useCallback(
    async (recipientInput: string, amountInput: string) => {
      if (inFlight.current || !address) return
      const recipient = validateRecipient(recipientInput, address)
      const amount = validateAmount(amountInput)
      if (!recipient.ok) return setState({ phase: 'idle', message: recipient.message })
      if (!amount.ok) return setState({ phase: 'idle', message: amount.message })

      setState({ phase: 'quoting' })
      try {
        const quote = await buildQuote({ from: address, to: recipient.value, amount: amount.value })
        setState({ phase: 'review', quote })
      } catch (error) {
        const message = error instanceof QuoteError ? error.message : classifyError(error).message
        setState({ phase: 'idle', message })
      }
    },
    [address],
  )

  const watchReceipt = useCallback(async (hash: Hash, quote: SendQuote) => {
    setState({ phase: 'pending', quote, hash })
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        pollingInterval: RECEIPT_SETTINGS.pollMs,
        timeout: RECEIPT_SETTINGS.waitTimeoutMs,
      })
      if (receipt.status === 'success') {
        setState({ phase: 'confirmed', quote, hash: receipt.transactionHash, blockNumber: receipt.blockNumber })
        onConfirmed.current?.()
      } else {
        setState({
          phase: 'failed',
          quote,
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          message: 'The transaction was mined but reverted. No funds were sent. A network fee may still have been charged.',
        })
      }
    } catch {
      setState({
        phase: 'unconfirmed',
        quote,
        hash,
        message: 'Not confirmed yet. Do not send again: the transaction may still be included. Check its status below.',
      })
    }
  }, [])

  const confirm = useCallback(async () => {
    if (inFlight.current) return
    const quote = state.quote
    if (state.phase !== 'review' || !quote) return
    if (!isConnected || !address || address !== quote.from) {
      return setState({ phase: 'idle', message: 'Your wallet account changed. Review the payment again.' })
    }
    if (chainId !== ARC_MAINNET_CHAIN_ID) {
      return setState({ phase: 'review', quote, message: 'Switch your wallet to Arc Mainnet first.' })
    }

    inFlight.current = true
    setState({ phase: 'awaiting-wallet', quote })
    try {
      const hash = await sendTransactionAsync({
        chainId: ARC_MAINNET_CHAIN_ID,
        to: quote.to,
        value: quote.valueNative,
        gas: quote.gas,
        maxFeePerGas: quote.maxFeePerGas,
        maxPriorityFeePerGas: quote.maxPriorityFeePerGas,
      })
      await watchReceipt(hash, quote)
    } catch (error) {
      const classified = classifyError(error)
      if (classified.kind === 'rejected') {
        setState({ phase: 'rejected', quote, message: classified.message })
      } else {
        setState({ phase: 'failed', quote, message: classified.message })
      }
    } finally {
      inFlight.current = false
    }
  }, [address, chainId, isConnected, sendTransactionAsync, state.phase, state.quote, watchReceipt])

  /** Looks the receipt up again after an "unconfirmed" result. Never resubmits. */
  const recheck = useCallback(async () => {
    const { hash, quote } = state
    if (!hash || !quote || inFlight.current) return
    inFlight.current = true
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash })
      if (receipt.status === 'success') {
        setState({ phase: 'confirmed', quote, hash, blockNumber: receipt.blockNumber })
        onConfirmed.current?.()
      } else {
        setState({ phase: 'failed', quote, hash, blockNumber: receipt.blockNumber, message: 'The transaction was mined but reverted.' })
      }
    } catch {
      setState((current) => ({ ...current, message: 'Still not found onchain. Do not send again. Check the explorer or try later.' }))
    } finally {
      inFlight.current = false
    }
  }, [state])

  const busy = state.phase === 'quoting' || state.phase === 'awaiting-wallet' || state.phase === 'pending'

  return { state, busy, prepare, confirm, reset, backToEdit, recheck }
}
