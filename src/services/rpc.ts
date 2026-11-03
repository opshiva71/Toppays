/**
 * Centralized Arc Mainnet RPC client. Every non-wallet read in the app goes
 * through `publicClient`, and the wagmi config reuses `createArcTransport`, so
 * timeout, retry and fallback behavior is defined in exactly one place.
 */

import { createPublicClient, createTransport, http, type EIP1193RequestFn, type Transport } from 'viem'
import { ARC_MAINNET_CHAIN_ID, ARC_RPC_URLS, RPC_SETTINGS, arcMainnet } from '../../config/network'

/* -------------------------------------------------------------------------- */
/* Shared limiter and endpoint state (module level, so wagmi and publicClient   */
/* share one budget instead of each bursting on their own)                      */
/* -------------------------------------------------------------------------- */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

let nextSlot = 0
let inFlight = 0
const waiters: Array<() => void> = []

async function acquireSlot(): Promise<void> {
  const now = Date.now()
  const start = Math.max(now, nextSlot)
  nextSlot = start + RPC_SETTINGS.minSpacingMs
  if (start > now) await sleep(start - now)
  while (inFlight >= RPC_SETTINGS.maxConcurrent) {
    await new Promise<void>((resolve) => waiters.push(resolve))
  }
  inFlight += 1
}

function releaseSlot(): void {
  inFlight -= 1
  waiters.shift()?.()
}

interface EndpointState {
  coolUntil: number
  /** undefined = not checked yet, true = answered chain 5042, false = answered a different chain (never used). */
  chainOk: boolean | undefined
}
const endpointState = new Map<string, EndpointState>()
const stateOf = (url: string): EndpointState => {
  let state = endpointState.get(url)
  if (!state) {
    state = { coolUntil: 0, chainOk: undefined }
    endpointState.set(url, state)
  }
  return state
}

const RATE_LIMIT_PATTERN = /rate limit|limit exceeded|too many requests|\b429\b|-32005/i
/** Errors that every healthy node would return for the same request: do not fail over, report them. */
const DETERMINISTIC_PATTERN = /revert|invalid (params|argument|opcode)|nonce too|insufficient funds|gas required exceeds|intrinsic gas|out of gas/i

function errorText(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (typeof current !== 'object') break
    const record = current as { message?: unknown; shortMessage?: unknown; details?: unknown; cause?: unknown; code?: unknown }
    for (const key of ['shortMessage', 'message', 'details'] as const) {
      if (typeof record[key] === 'string') parts.push(record[key])
    }
    if (typeof record.code === 'number') parts.push(String(record.code))
    current = record.cause
  }
  return parts.join(' | ')
}

export const isRateLimitError = (error: unknown): boolean => RATE_LIMIT_PATTERN.test(errorText(error))
const isDeterministicError = (error: unknown): boolean => {
  const text = errorText(error)
  return !RATE_LIMIT_PATTERN.test(text) && DETERMINISTIC_PATTERN.test(text)
}

/**
 * One Arc transport for the whole app: tries the endpoints in order, skips an
 * endpoint for a while after it rate limits, only ever uses an endpoint that has
 * answered `eth_chainId` = 5042, and smooths bursts before they reach the node.
 */
export function createArcTransport(): Transport {
  const urls = [...ARC_RPC_URLS]
  return ({ chain, timeout }) => {
    const children = new Map(
      urls.map((url) => [url, http(url, { timeout: timeout ?? RPC_SETTINGS.timeoutMs, retryCount: 0 })({ chain, retryCount: 0, timeout })] as const),
    )

    const chainVerified = async (url: string): Promise<boolean> => {
      const state = stateOf(url)
      if (state.chainOk !== undefined) return state.chainOk
      try {
        const result = (await children.get(url)?.request({ method: 'eth_chainId' })) as string
        state.chainOk = Number(BigInt(result)) === ARC_MAINNET_CHAIN_ID
      } catch {
        return false // could not check right now; try again next time, do not trust it yet
      }
      return state.chainOk
    }

    return createTransport({
      key: 'arc',
      name: 'Arc RPC',
      type: 'arc-failover',
      retryCount: RPC_SETTINGS.retryCount,
      retryDelay: RPC_SETTINGS.retryDelayMs,
      timeout: timeout ?? RPC_SETTINGS.timeoutMs,
      request: (async ({ method, params }: { method: string; params?: unknown }) => {
        const now = Date.now()
        const order = [...urls].sort((a, b) => Number(stateOf(a).coolUntil > now) - Number(stateOf(b).coolUntil > now))
        let lastError: unknown
        for (const url of order) {
          if (stateOf(url).chainOk === false) continue
          if (!(await chainVerified(url))) continue
          await acquireSlot()
          try {
            return await children.get(url)?.request({ method, params } as never)
          } catch (error) {
            lastError = error
            if (isDeterministicError(error)) throw error
            stateOf(url).coolUntil = Date.now() + (isRateLimitError(error) ? RPC_SETTINGS.cooldownMs : 4_000)
          } finally {
            releaseSlot()
          }
        }
        throw lastError instanceof Error ? lastError : new Error('No Arc Mainnet RPC endpoint is available right now.')
      }) as EIP1193RequestFn,
    })
  }
}

export const publicClient = createPublicClient({
  chain: arcMainnet,
  transport: createArcTransport(),
})

export type RpcHealth =
  | { ok: true; chainId: number; blockNumber: bigint; latencyMs: number; checkedAt: number }
  | { ok: false; reason: 'wrong-chain' | 'unreachable'; message: string; checkedAt: number }

/** One round trip that proves the endpoint is reachable AND is really Arc Mainnet. */
export async function checkRpcHealth(): Promise<RpcHealth> {
  const started = performance.now()
  try {
    const [chainId, blockNumber] = await Promise.all([publicClient.getChainId(), publicClient.getBlockNumber()])
    if (chainId !== ARC_MAINNET_CHAIN_ID) {
      return {
        ok: false,
        reason: 'wrong-chain',
        message: `RPC reports chain ${chainId}, expected Arc Mainnet (${ARC_MAINNET_CHAIN_ID}). Reads are blocked.`,
        checkedAt: Date.now(),
      }
    }
    return { ok: true, chainId, blockNumber, latencyMs: Math.round(performance.now() - started), checkedAt: Date.now() }
  } catch {
    return {
      ok: false,
      reason: 'unreachable',
      message: 'Cannot reach the Arc RPC. Check your connection; the app retries automatically.',
      checkedAt: Date.now(),
    }
  }
}

/** Transient failures worth retrying: rate limits, lagging backends (-32014), timeouts. */
export function isTransientRpcError(error: unknown): boolean {
  const text = collectMessages(error).toLowerCase()
  return (
    text.includes('rate limit') ||
    text.includes('-32005') ||
    text.includes('-32014') ||
    text.includes('not available') ||
    text.includes('timed out') ||
    text.includes('timeout') ||
    text.includes('failed to fetch') ||
    text.includes('http request failed') ||
    text.includes('429') ||
    text.includes('503') ||
    text.includes('502')
  )
}

function collectMessages(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (typeof current === 'object') {
      const record = current as { message?: unknown; shortMessage?: unknown; details?: unknown; cause?: unknown; code?: unknown }
      for (const key of ['shortMessage', 'message', 'details'] as const) {
        if (typeof record[key] === 'string') parts.push(record[key])
      }
      if (typeof record.code === 'number' || typeof record.code === 'string') parts.push(String(record.code))
      current = record.cause
    } else {
      if (typeof current === 'string') parts.push(current)
      break
    }
  }
  return parts.join(' | ')
}

/** Retries `fn` with growing delay for transient RPC errors only. Never used for sending transactions. */
export async function withRpcRetry<T>(fn: () => Promise<T>, attempts = 5, baseDelayMs = 500): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isTransientRpcError(error) || attempt === attempts - 1) break
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt))
    }
  }
  throw lastError
}

export { collectMessages }
