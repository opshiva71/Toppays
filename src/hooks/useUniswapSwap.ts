import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useSendTransaction } from 'wagmi'
import type { Address, Hex } from 'viem'
import { RECEIPT_SETTINGS } from '../../config/network'
import { SWAP_CHAIN_ID, SWAP_SETTINGS, SWAP_TOKENS, type SwapTokenConfig } from '../../config/uniswap'
import { classifyError } from '@/services/errors'
import { publicClient } from '@/services/rpc'
import { getFees } from '@/services/send'
import {
  buildExactApproval,
  buildSwapCall,
  fetchQuote,
  readAllowance,
  simulateSwap,
  simulateTransaction,
  SwapError,
  type QuoteParams,
  type SwapFailureReason,
  type SwapQuoteView,
} from '@/services/uniswap'
import { parseTokenInput, readSwapBalances, sanitizeTokenInput } from '@/services/swapTokens'
import { useArcWallet, useSpendableNative } from './useArc'

export type SwapPhase = 'idle' | 'approving' | 'submitting' | 'pending' | 'confirmed' | 'failed' | 'rejected' | 'unconfirmed'

export interface SwapExecution {
  phase: SwapPhase
  message?: string
  hash?: Hex
  kind?: 'approval' | 'swap'
  blockNumber?: bigint
  /** Real change in the output token balance after the swap confirmed (null when it could not be read). */
  receivedDelta?: bigint | null
  /** Why it stopped, and the facts behind it (stage, decoded revert reason, amounts, allowance, deadline, RPC text). */
  reason?: SwapFailureReason
  diagnostics?: readonly string[]
}

const USDC = SWAP_TOKENS[0]
const EURC = SWAP_TOKENS[1] ?? SWAP_TOKENS[0]

const WEI_PER_USDC_UNIT = 10n ** 12n

function sameParams(a: QuoteParams | undefined, b: QuoteParams | null): boolean {
  return (
    !!a &&
    !!b &&
    a.tokenIn.address === b.tokenIn.address &&
    a.tokenOut.address === b.tokenOut.address &&
    a.amountIn === b.amountIn &&
    a.swapper === b.swapper &&
    a.slippage === b.slippage
  )
}

export function useUniswapSwap(options: { onSettled?: () => void } = {}) {
  const wallet = useArcWallet()
  const { address } = wallet
  const { connector } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const spendable = useSpendableNative(address)

  const [tokenIn, setTokenIn] = useState<SwapTokenConfig>(USDC)
  const [tokenOut, setTokenOut] = useState<SwapTokenConfig>(EURC)
  const [amountText, setAmountText] = useState('')
  const [slippage, setSlippage] = useState<number>(SWAP_SETTINGS.defaultSlippage)

  const [quote, setQuote] = useState<SwapQuoteView | null>(null)
  const [approvalNeeded, setApprovalNeeded] = useState<boolean | null>(null)
  const [quoteError, setQuoteError] = useState<SwapError | null>(null)
  const [fetching, setFetching] = useState(false)
  const [impactAck, setImpactAck] = useState(false)
  const [execution, setExecution] = useState<SwapExecution>({ phase: 'idle' })
  const [notice, setNotice] = useState<string | null>(null)

  const inFlight = useRef(false)
  const generation = useRef(0)
  const onSettledRef = useRef(options.onSettled)
  useEffect(() => {
    onSettledRef.current = options.onSettled
  })

  const busy = execution.phase === 'approving' || execution.phase === 'submitting' || execution.phase === 'pending'

  /* ----- Balances ----- */
  const balancesQuery = useQuery({
    queryKey: ['swap-balances', address],
    queryFn: () => readSwapBalances(address as Address),
    enabled: Boolean(address),
    refetchInterval: 8_000,
    staleTime: 4_000,
  })
  const { refetch: refetchBalances } = balancesQuery
  const { refetch: refetchNative } = spendable
  const refreshAll = useCallback(() => {
    void refetchBalances()
    void refetchNative()
    onSettledRef.current?.()
  }, [refetchBalances, refetchNative])

  const balances = balancesQuery.data
  const balanceIn = balances?.[tokenIn.symbol]
  const balanceOut = balances?.[tokenOut.symbol]
  const nativeBalance = spendable.data?.value

  /* ----- Derived request ----- */
  const amountIn = useMemo(() => parseTokenInput(amountText, tokenIn.decimals), [amountText, tokenIn.decimals])
  const params = useMemo<QuoteParams | null>(() => {
    if (!address || amountIn === null || amountIn <= 0n || tokenIn.address === tokenOut.address) return null
    return { tokenIn, tokenOut, amountIn, swapper: address, slippage }
  }, [address, amountIn, tokenIn, tokenOut, slippage])

  const activeQuote = quote && sameParams(quote.params, params) ? quote : null

  /* ----- Quote loading (debounced, refreshed on a timer). Everything comes from Arc Mainnet. ----- */
  const loadQuote = useCallback(async (request: QuoteParams, silent: boolean, signal: AbortSignal) => {
    generation.current += 1
    const mine = generation.current
    if (!silent) setFetching(true)
    try {
      const [view, allowance] = await Promise.all([fetchQuote(request), readAllowance(request.swapper, request.tokenIn)])
      if (mine !== generation.current || signal.aborted) return
      setQuote(view)
      setApprovalNeeded(allowance < request.amountIn)
      setQuoteError(null)
      setImpactAck(false)
    } catch (error) {
      if (mine !== generation.current || signal.aborted) return
      setQuoteError(error instanceof SwapError ? error : new SwapError('network', 'Could not load a quote. Try again.'))
      if (!silent) {
        setQuote(null)
        setApprovalNeeded(null)
      }
    } finally {
      if (mine === generation.current) setFetching(false)
    }
  }, [])

  const paramsKey = params
    ? `${params.tokenIn.address}:${params.tokenOut.address}:${params.amountIn}:${params.swapper}:${params.slippage}`
    : ''

  useEffect(() => {
    if (!params || busy) return
    const controller = new AbortController()
    const timer = setTimeout(() => void loadQuote(params, false, controller.signal), SWAP_SETTINGS.quoteDebounceMs)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void loadQuote(params, true, controller.signal)
    }, SWAP_SETTINGS.quoteRefreshMs)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
      controller.abort()
      generation.current += 1
    }
    // paramsKey captures every field of params that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, busy, loadQuote])

  /* ----- Input handlers ----- */
  const setAmount = useCallback(
    (value: string) => {
      setAmountText(sanitizeTokenInput(value, tokenIn.decimals))
      setExecution((previous) => (previous.phase === 'confirmed' || previous.phase === 'failed' || previous.phase === 'rejected' ? { phase: 'idle' } : previous))
    },
    [tokenIn.decimals],
  )

  const selectIn = useCallback(
    (token: SwapTokenConfig) => {
      if (token.address === tokenOut.address) setTokenOut(tokenIn)
      setTokenIn(token)
      setAmountText((text) => sanitizeTokenInput(text, token.decimals))
    },
    [tokenIn, tokenOut.address],
  )

  const selectOut = useCallback(
    (token: SwapTokenConfig) => {
      if (token.address === tokenIn.address) {
        setTokenIn(tokenOut)
        setAmountText((text) => sanitizeTokenInput(text, tokenOut.decimals))
      }
      setTokenOut(token)
    },
    [tokenIn.address, tokenOut],
  )

  const reverse = useCallback(() => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setAmountText((text) => sanitizeTokenInput(text, tokenOut.decimals))
  }, [tokenIn, tokenOut])

  /* ----- Balance and gas checks ----- */
  const gasReserveUsdc = useMemo(() => {
    const buffer = parseTokenInput(SWAP_SETTINGS.gasReserveBufferUsdc, 6) ?? 0n
    if (activeQuote?.gasFeeWei) return (activeQuote.gasFeeWei + WEI_PER_USDC_UNIT - 1n) / WEI_PER_USDC_UNIT + buffer
    return parseTokenInput(SWAP_SETTINGS.fallbackGasReserveUsdc, 6) ?? 0n
  }, [activeQuote])

  /** The most of the input token that can be swapped; for USDC this leaves room for the network fee. */
  const maxAmount = useMemo(() => {
    if (balanceIn === undefined) return null
    if (tokenIn.symbol !== 'USDC') return balanceIn
    return balanceIn > gasReserveUsdc ? balanceIn - gasReserveUsdc : 0n
  }, [balanceIn, tokenIn.symbol, gasReserveUsdc])

  const insufficientBalance = amountIn !== null && balanceIn !== undefined && amountIn > balanceIn
  const insufficientGas = useMemo(() => {
    if (!activeQuote?.gasFeeWei || nativeBalance === undefined || amountIn === null) return false
    const spend = tokenIn.symbol === 'USDC' ? amountIn * WEI_PER_USDC_UNIT : 0n
    return nativeBalance < spend + activeQuote.gasFeeWei
  }, [activeQuote, nativeBalance, amountIn, tokenIn.symbol])

  const highImpact = (activeQuote?.priceImpact ?? 0) >= SWAP_SETTINGS.priceImpactDanger
  const impactBlocked = highImpact && !impactAck

  /* ----- Execution ----- */
  const sendAndWait = useCallback(
    async (tx: { to: Address; data: Hex; value: bigint; gas: bigint }, kind: 'approval' | 'swap') => {
      if (!address) throw new SwapError('invalid', 'Connect a wallet first.')
      const fees = await getFees()
      const hash = await sendTransactionAsync({
        chainId: SWAP_CHAIN_ID,
        to: tx.to,
        data: tx.data,
        value: tx.value,
        gas: tx.gas,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      })
      setExecution({ phase: 'pending', kind, hash })
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          pollingInterval: RECEIPT_SETTINGS.pollMs,
          timeout: RECEIPT_SETTINGS.waitTimeoutMs,
        })
        return { hash, receipt }
      } catch {
        setExecution({
          phase: 'unconfirmed',
          kind,
          hash,
          message: 'Not confirmed yet. The transaction may still be processed. Check the explorer before trying again, and do not submit it twice.',
        })
        return { hash, receipt: null }
      }
    },
    [address, sendTransactionAsync],
  )

  const handleError = useCallback((error: unknown, kind: 'approval' | 'swap') => {
    if (error instanceof SwapError) {
      setExecution({ phase: 'failed', kind, message: error.message, reason: error.reason, diagnostics: error.diagnostics })
      return
    }
    const classified = classifyError(error)
    if (classified.kind === 'rejected') {
      setExecution({
        phase: 'rejected',
        kind,
        message: kind === 'approval' ? 'You rejected the approval in your wallet. Nothing was approved.' : 'You rejected the swap in your wallet. No funds moved.',
      })
      return
    }
    setExecution({ phase: 'failed', kind, message: classified.message })
  }, [])

  /** Approves exactly the swap amount for the Uniswap SwapRouter02. Only offered when the current allowance is too low. */
  const approve = useCallback(async () => {
    if (inFlight.current || !activeQuote || approvalNeeded !== true || !address) return
    if (wallet.isWrongNetwork) {
      setExecution({ phase: 'failed', kind: 'approval', message: 'Switch your wallet to Arc Mainnet (chain 5042) first.' })
      return
    }
    inFlight.current = true
    setNotice(null)
    const request = activeQuote.params
    try {
      setExecution({ phase: 'approving', kind: 'approval' })
      const exact = buildExactApproval(request.tokenIn, request.amountIn)
      // Simulate first: if the approval itself would fail, the wallet is never asked.
      const gas = await simulateTransaction({
        stage: 'approval',
        account: address,
        call: { to: exact.to, data: exact.data, value: 0n },
        quote: activeQuote,
      })
      const result = await sendAndWait({ to: exact.to, data: exact.data, value: 0n, gas }, 'approval')
      if (!result.receipt) return
      if (result.receipt.status !== 'success') {
        setExecution({ phase: 'failed', kind: 'approval', hash: result.hash, message: 'The approval transaction failed onchain. Nothing was approved.' })
        return
      }
      setExecution({ phase: 'idle' })
      setNotice(`${request.tokenIn.symbol} approved for exactly this amount. You can swap now.`)
      refreshAll()
      await loadQuote(request, true, new AbortController().signal)
    } catch (error) {
      handleError(error, 'approval')
    } finally {
      inFlight.current = false
    }
  }, [activeQuote, address, approvalNeeded, handleError, loadQuote, refreshAll, sendAndWait, wallet.isWrongNetwork])

  /** Simulates, then sends the swap from the user's wallet. The wallet's own prompt is the explicit confirmation. */
  const swap = useCallback(async () => {
    if (inFlight.current || !activeQuote || approvalNeeded !== false || !address) return
    if (wallet.isWrongNetwork) {
      setExecution({ phase: 'failed', kind: 'swap', message: 'Switch your wallet to Arc Mainnet (chain 5042) first.' })
      return
    }
    if (insufficientBalance || insufficientGas || impactBlocked) return
    inFlight.current = true
    setNotice(null)
    const quoted = activeQuote
    try {
      if (Date.now() - quoted.fetchedAt > SWAP_SETTINGS.quoteMaxAgeMs) {
        setExecution({ phase: 'idle', message: 'The quote was refreshed. Review the new amounts, then confirm again.' })
        await loadQuote(quoted.params, true, new AbortController().signal)
        return
      }
      setExecution({ phase: 'submitting', kind: 'swap' })
      const call = buildSwapCall(quoted)
      const gas = await simulateSwap(address, call, quoted)
      const before = await readSwapBalances(address)
        .then((all) => all[quoted.params.tokenOut.symbol] ?? null)
        .catch(() => null)
      const result = await sendAndWait({ to: call.to, data: call.data, value: call.value, gas }, 'swap')
      if (!result.receipt) return
      if (result.receipt.status !== 'success') {
        setExecution({ phase: 'failed', kind: 'swap', hash: result.hash, message: 'The swap reverted onchain. Nothing was swapped. The network fee was still spent.' })
        refreshAll()
        return
      }
      const after = await readSwapBalances(address)
        .then((all) => all[quoted.params.tokenOut.symbol] ?? null)
        .catch(() => null)
      setExecution({
        phase: 'confirmed',
        kind: 'swap',
        hash: result.hash,
        blockNumber: result.receipt.blockNumber,
        receivedDelta: before !== null && after !== null && after >= before ? after - before : null,
      })
      setQuote(null)
      setApprovalNeeded(null)
      setAmountText('')
      refreshAll()
    } catch (error) {
      handleError(error, 'swap')
      // A stale quote, a moved price or a passed deadline is fixed by re-quoting: recalculate the minimum received now.
      if (error instanceof SwapError && (error.reason === 'price-moved' || error.reason === 'deadline' || error.reason === 'allowance')) {
        void loadQuote(quoted.params, true, new AbortController().signal)
      }
    } finally {
      inFlight.current = false
    }
  }, [activeQuote, address, approvalNeeded, handleError, impactBlocked, insufficientBalance, insufficientGas, loadQuote, refreshAll, sendAndWait, wallet.isWrongNetwork])

  const dismiss = useCallback(() => {
    if (inFlight.current) return
    setExecution({ phase: 'idle' })
    setNotice(null)
  }, [])

  const setCustomSlippage = useCallback((value: number) => {
    if (Number.isFinite(value) && value >= SWAP_SETTINGS.minSlippage && value <= SWAP_SETTINGS.maxSlippage) {
      setSlippage(Math.round(value * 100) / 100)
    }
  }, [])

  return {
    wallet,
    connectorReady: Boolean(connector),
    address,
    // inputs
    tokenIn,
    tokenOut,
    amountText,
    amountIn,
    slippage,
    setAmount,
    selectIn,
    selectOut,
    reverse,
    setSlippage: setCustomSlippage,
    // data
    balances,
    balanceIn,
    balanceOut,
    balancesLoading: balancesQuery.isLoading,
    nativeBalance,
    quote: activeQuote,
    fetching,
    quoteError,
    approvalNeeded,
    maxAmount,
    gasReserveUsdc,
    // validation
    insufficientBalance,
    insufficientGas,
    highImpact,
    impactAck,
    setImpactAck,
    impactBlocked,
    // execution
    execution,
    notice,
    busy,
    approve,
    swap,
    dismiss,
    refreshQuote: () => (params ? loadQuote(params, false, new AbortController().signal) : Promise.resolve()),
  }
}
