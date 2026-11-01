import { collectMessages } from './rpc'

export type ErrorKind =
  | 'rejected'
  | 'insufficient-funds'
  | 'insufficient-gas'
  | 'wrong-chain'
  | 'network'
  | 'reverted'
  | 'unknown'

export interface ClassifiedError {
  kind: ErrorKind
  message: string
}

function hasCode(error: unknown, code: number): boolean {
  let current: unknown = error
  for (let depth = 0; current && typeof current === 'object' && depth < 6; depth += 1) {
    if ((current as { code?: unknown }).code === code) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** Maps wallet/RPC errors to plain messages. Never exposes raw provider text as the headline. */
export function classifyError(error: unknown): ClassifiedError {
  const text = collectMessages(error).toLowerCase()

  if (hasCode(error, 4001) || text.includes('user rejected') || text.includes('user denied') || text.includes('rejected the request')) {
    return { kind: 'rejected', message: 'You rejected the request in your wallet. Nothing was sent.' }
  }
  if (text.includes('chain mismatch') || text.includes('does not match the target chain') || hasCode(error, 4902)) {
    return { kind: 'wrong-chain', message: 'Your wallet is not on Arc Mainnet. Switch network and try again.' }
  }
  if (text.includes('insufficient funds') || text.includes('exceeds the balance') || text.includes('exceeds balance')) {
    return {
      kind: 'insufficient-funds',
      message: 'Your balance cannot cover the amount plus the network fee (paid in USDC).',
    }
  }
  if (text.includes('reverted') || text.includes('execution reverted')) {
    return {
      kind: 'reverted',
      message: 'The network rejected this transfer. The recipient may be blocklisted or not allowed to receive USDC.',
    }
  }
  if (text.includes('timeout') || text.includes('timed out') || text.includes('failed to fetch') || text.includes('http request failed') || text.includes('rate limit')) {
    return { kind: 'network', message: 'Network issue talking to the Arc RPC. Check your connection and try again.' }
  }
  return { kind: 'unknown', message: 'Something went wrong. Please try again.' }
}
