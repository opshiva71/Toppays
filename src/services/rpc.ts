/**
 * Centralized Arc Mainnet RPC client. Every non-wallet read in the app goes
 * through `publicClient`, and the wagmi config reuses `createArcTransport`, so
 * timeout, retry and fallback behavior is defined in exactly one place.
 */

import { createPublicClient, fallback, http, type Transport } from 'viem'
import { ARC_MAINNET_CHAIN_ID, ARC_RPC_URLS, RPC_SETTINGS, arcMainnet } from '../../config/network'

export function createArcTransport(): Transport {
  const transports = ARC_RPC_URLS.map((url) =>
    http(url, {
      timeout: RPC_SETTINGS.timeoutMs,
      retryCount: RPC_SETTINGS.retryCount,
      retryDelay: RPC_SETTINGS.retryDelayMs,
    }),
  )
  if (transports.length === 1) return transports[0]
  return fallback(transports, { rank: false, retryCount: 1 })
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
