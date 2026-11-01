import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { HISTORY_SETTINGS } from '../../config/network'
import {
  getBlockTime,
  getHeadBlock,
  mergeEntries,
  scanBackwards,
  scanForward,
  type HistoryEntry,
} from '@/services/history'

export interface HistoryState {
  entries: HistoryEntry[]
  /** True until the first pass for this wallet has finished or failed. */
  loading: boolean
  /** True while a backward pass is running (first load or "scan older"). */
  scanning: boolean
  error: string | null
  oldestScanned: bigint | null
  oldestScannedTime: number | null
  reachedGenesis: boolean
  scanOlder: () => void
  retry: () => void
}

interface Store {
  address?: Address
  entries: HistoryEntry[]
  scanning: boolean
  firstPassDone: boolean
  error: string | null
  oldestScanned: bigint | null
  oldestScannedTime: number | null
  reachedGenesis: boolean
}

const EMPTY: Store = {
  entries: [],
  scanning: false,
  firstPassDone: false,
  error: null,
  oldestScanned: null,
  oldestScannedTime: null,
  reachedGenesis: false,
}

/**
 * Reads real history from Arc Mainnet logs. A first pass walks backwards from the
 * chain head until it finds enough entries or runs out of its per-pass budget;
 * "scan older" continues from where it stopped. A light poll then picks up new
 * blocks so incoming payments show up on their own.
 */
export function useTransactionHistory(address: Address | undefined, onIncoming?: (entries: HistoryEntry[]) => void): HistoryState {
  const [store, setStore] = useState<Store>(EMPTY)
  const [attempt, setAttempt] = useState(0)

  const newestScanned = useRef<bigint | null>(null)
  const oldestRef = useRef<bigint | null>(null)
  const genesisRef = useRef(false)
  const passRunning = useRef(false)
  const generation = useRef(0)
  const onIncomingRef = useRef(onIncoming)

  useEffect(() => {
    onIncomingRef.current = onIncoming
  })

  /** Updates the store for `addr`; a store that belongs to another wallet is discarded first. */
  const patch = useCallback((addr: Address, fn: (current: Store) => Partial<Store>) => {
    setStore((previous) => {
      const base = previous.address === addr ? previous : { ...EMPTY, address: addr }
      return { ...base, ...fn(base) }
    })
  }, [])

  const runBackwardPass = useCallback(
    async (target: Address, gen: number, startBlock: bigint) => {
      if (passRunning.current) return
      passRunning.current = true
      patch(target, () => ({ scanning: true, error: null }))
      try {
        await scanBackwards({
          address: target,
          startBlock,
          maxChunks: HISTORY_SETTINGS.chunksPerPass,
          targetEntries: HISTORY_SETTINGS.targetEntries,
          shouldStop: () => gen !== generation.current,
          onChunk: (chunkEntries, oldest, genesis) => {
            if (gen !== generation.current) return
            oldestRef.current = oldest
            genesisRef.current = genesis
            patch(target, (current) => ({
              oldestScanned: oldest,
              reachedGenesis: genesis,
              entries: chunkEntries.length ? mergeEntries(current.entries, chunkEntries) : current.entries,
            }))
          },
        })
        if (gen === generation.current && oldestRef.current !== null) {
          const time = await getBlockTime(oldestRef.current)
          if (gen === generation.current) patch(target, () => ({ oldestScannedTime: time }))
        }
      } catch {
        if (gen === generation.current) {
          patch(target, () => ({
            error: 'Could not read history from the Arc RPC. Entries found so far are shown. Retry to continue.',
          }))
        }
      } finally {
        passRunning.current = false
        if (gen === generation.current) patch(target, () => ({ scanning: false, firstPassDone: true }))
      }
    },
    [patch],
  )

  // First pass whenever the wallet changes (or the user retries after a failure).
  useEffect(() => {
    if (!address) return
    generation.current += 1
    const gen = generation.current
    passRunning.current = false
    newestScanned.current = null
    oldestRef.current = null
    genesisRef.current = false
    void (async () => {
      try {
        const head = await getHeadBlock()
        if (gen !== generation.current) return
        newestScanned.current = head
        await runBackwardPass(address, gen, head)
      } catch {
        if (gen === generation.current) {
          patch(address, () => ({ error: 'Could not reach the Arc RPC to read history. Retry in a moment.', firstPassDone: true }))
        }
      }
    })()
    return () => {
      generation.current += 1
    }
  }, [address, attempt, runBackwardPass, patch])

  // Live poll for new blocks so incoming payments appear automatically.
  useEffect(() => {
    if (!address) return
    let busy = false
    const timer = setInterval(() => {
      if (busy || newestScanned.current === null || document.hidden) return
      const gen = generation.current
      busy = true
      void (async () => {
        try {
          const head = await getHeadBlock()
          const from = newestScanned.current
          if (gen !== generation.current || from === null || head <= from) return
          const fresh = await scanForward(address, from + 1n, head, () => gen !== generation.current)
          if (gen !== generation.current) return
          newestScanned.current = head
          if (fresh.length) {
            patch(address, (current) => ({ entries: mergeEntries(current.entries, fresh) }))
            onIncomingRef.current?.(fresh)
          }
        } catch {
          // Transient RPC trouble: the next tick retries from the same block.
        } finally {
          busy = false
        }
      })()
    }, HISTORY_SETTINGS.livePollMs)
    return () => clearInterval(timer)
  }, [address, attempt, patch])

  const scanOlder = useCallback(() => {
    if (!address || oldestRef.current === null || genesisRef.current || passRunning.current) return
    void runBackwardPass(address, generation.current, oldestRef.current - 1n)
  }, [address, runBackwardPass])

  const retry = useCallback(() => {
    if (!address) return
    if (oldestRef.current !== null) {
      scanOlder()
      return
    }
    patch(address, () => ({ firstPassDone: false, error: null }))
    setAttempt((value) => value + 1)
  }, [address, patch, scanOlder])

  const view = address && store.address === address ? store : EMPTY

  return {
    entries: view.entries,
    loading: Boolean(address) && !view.firstPassDone,
    scanning: view.scanning,
    error: view.error,
    oldestScanned: view.oldestScanned,
    oldestScannedTime: view.oldestScannedTime,
    reachedGenesis: view.reachedGenesis,
    scanOlder,
    retry,
  }
}
