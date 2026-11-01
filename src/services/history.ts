/**
 * Transaction history read straight from Arc Mainnet logs. No third-party
 * indexer and no stored or generated records: every entry is an EIP-7708
 * `Transfer` log from the system emitter, which covers native sends, ERC-20
 * transfers, mints and burns exactly once each.
 *
 * Reverted transactions emit no log, so they never appear here. The send flow
 * reports its own failures.
 */

import { getAddress, parseAbiItem, type Address, type Hash } from 'viem'
import { ARC_SYSTEM_TRANSFER_EMITTER, HISTORY_SETTINGS } from '../../config/network'
import { collectMessages, publicClient, withRpcRetry } from './rpc'

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

export type Direction = 'sent' | 'received'

export interface HistoryEntry {
  id: string
  txHash: Hash
  logIndex: number
  blockNumber: bigint
  /** Unix seconds from the block header, or null if it could not be fetched. */
  timestamp: number | null
  direction: Direction
  counterparty: Address
  /** 18-decimal native units (the system log precision). */
  amountNative: bigint
  /** Arc finality is deterministic: a log in a block is final. */
  status: 'confirmed'
}

let chunkBlocks: number = HISTORY_SETTINGS.chunkBlocks

const timestampCache = new Map<string, number>()
const MAX_TIMESTAMP_FALLBACK_LOOKUPS = 10

async function blockTimestamp(blockNumber: bigint): Promise<number | null> {
  const key = blockNumber.toString()
  const cached = timestampCache.get(key)
  if (cached !== undefined) return cached
  try {
    const block = await withRpcRetry(() => publicClient.getBlock({ blockNumber }))
    const value = Number(block.timestamp)
    timestampCache.set(key, value)
    return value
  } catch {
    return null
  }
}

export async function getHeadBlock(): Promise<bigint> {
  return withRpcRetry(() => publicClient.getBlockNumber())
}

function isRangeError(error: unknown): boolean {
  const text = collectMessages(error).toLowerCase()
  return text.includes('range') || text.includes('too large') || text.includes('-32012')
}

/** Like scanRange, but splits the range in two when the endpoint rejects it as too large. */
async function scanRangeSplitting(address: Address, fromBlock: bigint, toBlock: bigint): Promise<HistoryEntry[]> {
  try {
    return await scanRange(address, fromBlock, toBlock)
  } catch (error) {
    if (!isRangeError(error) || fromBlock >= toBlock) throw error
    const mid = fromBlock + (toBlock - fromBlock) / 2n
    const left = await scanRangeSplitting(address, fromBlock, mid)
    const right = await scanRangeSplitting(address, mid + 1n, toBlock)
    return [...left, ...right]
  }
}

async function getLogsAdaptive(address: Address, side: 'from' | 'to', fromBlock: bigint, toBlock: bigint) {
  return withRpcRetry(async () => {
    try {
      return await publicClient.getLogs({
        address: ARC_SYSTEM_TRANSFER_EMITTER,
        event: TRANSFER_EVENT,
        args: side === 'from' ? { from: address } : { to: address },
        fromBlock,
        toBlock,
      })
    } catch (error) {
      if (isRangeError(error) && chunkBlocks > 500) chunkBlocks = Math.max(500, Math.floor(chunkBlocks / 2))
      throw error
    }
  })
}

/** Scans one block range (inclusive) for transfers touching `address`. */
export async function scanRange(address: Address, fromBlock: bigint, toBlock: bigint): Promise<HistoryEntry[]> {
  const [outgoing, incoming] = await Promise.all([
    getLogsAdaptive(address, 'from', fromBlock, toBlock),
    getLogsAdaptive(address, 'to', fromBlock, toBlock),
  ])

  const me = address.toLowerCase()
  const seen = new Set<string>()
  const raw: Array<{ log: (typeof outgoing)[number]; direction: Direction; counterparty: Address }> = []

  for (const log of [...outgoing, ...incoming]) {
    const { from, to, value } = log.args
    if (!from || !to || value === undefined || log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue
    const id = `${log.transactionHash}:${log.logIndex}`
    if (seen.has(id)) continue
    seen.add(id)
    const isOut = from.toLowerCase() === me
    const isIn = to.toLowerCase() === me
    if (!isOut && !isIn) continue
    // A self transfer cannot emit a log on Arc, so isOut && isIn is not expected; treat as received.
    raw.push({
      log,
      direction: isIn ? 'received' : 'sent',
      counterparty: getAddress(isIn ? from : to),
    })
  }

  // Arc RPC logs carry blockTimestamp, so no per-block lookups are needed. If an endpoint omits it,
  // resolve only the few newest blocks (bounded) and leave older rows showing their block number.
  for (const { log } of raw) {
    if (log.blockTimestamp !== undefined && log.blockTimestamp !== null && log.blockNumber !== null) {
      timestampCache.set(log.blockNumber.toString(), Number(log.blockTimestamp))
    }
  }
  const missing = Array.from(new Set(raw.map((item) => item.log.blockNumber)))
    .filter((block) => !timestampCache.has(block.toString()))
    .sort((a, b) => (a > b ? -1 : 1))
    .slice(0, MAX_TIMESTAMP_FALLBACK_LOOKUPS)
  await Promise.all(missing.map((block) => blockTimestamp(block)))

  return raw.map(({ log, direction, counterparty }) => ({
    id: `${log.transactionHash}:${log.logIndex}`,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber,
    timestamp: timestampCache.get((log.blockNumber).toString()) ?? null,
    direction,
    counterparty,
    amountNative: log.args.value as bigint,
    status: 'confirmed' as const,
  }))
}

function sortEntries(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1
    return b.logIndex - a.logIndex
  })
}

export function mergeEntries(current: HistoryEntry[], incoming: HistoryEntry[]): HistoryEntry[] {
  const map = new Map(current.map((entry) => [entry.id, entry]))
  for (const entry of incoming) map.set(entry.id, entry)
  return sortEntries(Array.from(map.values()))
}

export interface ScanProgress {
  entries: HistoryEntry[]
  /** Lowest block that has been fully scanned. */
  oldestScanned: bigint
  reachedGenesis: boolean
}

/**
 * Walks backwards from `startBlock` in bounded chunks. Calls `onChunk` after each
 * chunk so the UI can show results as they arrive. Stops after `maxChunks`, once
 * `targetEntries` more entries were found, or at block 0. `shouldStop` cancels.
 */
export async function scanBackwards(params: {
  address: Address
  startBlock: bigint
  maxChunks: number
  targetEntries: number
  shouldStop: () => boolean
  onChunk: (chunkEntries: HistoryEntry[], oldestScanned: bigint, reachedGenesis: boolean) => void
}): Promise<void> {
  const { address, shouldStop, onChunk } = params
  let to = params.startBlock
  let found = 0

  for (let chunk = 0; chunk < params.maxChunks; chunk += 1) {
    if (shouldStop() || to < 0n) return
    const span = BigInt(chunkBlocks)
    const from = to + 1n > span ? to - span + 1n : 0n
    const entries = await scanRangeSplitting(address, from, to)
    if (shouldStop()) return
    found += entries.length
    const reachedGenesis = from === 0n
    onChunk(entries, from, reachedGenesis)
    if (reachedGenesis || found >= params.targetEntries) return
    to = from - 1n
  }
}

/** Scans forward from `fromBlock` to `toBlock` (inclusive) in bounded chunks. */
export async function scanForward(address: Address, fromBlock: bigint, toBlock: bigint, shouldStop: () => boolean): Promise<HistoryEntry[]> {
  const all: HistoryEntry[] = []
  let from = fromBlock
  while (from <= toBlock && !shouldStop()) {
    const to = from + BigInt(chunkBlocks) - 1n < toBlock ? from + BigInt(chunkBlocks) - 1n : toBlock
    all.push(...(await scanRangeSplitting(address, from, to)))
    from = to + 1n
  }
  return all
}

export async function getBlockTime(blockNumber: bigint): Promise<number | null> {
  return blockTimestamp(blockNumber)
}
