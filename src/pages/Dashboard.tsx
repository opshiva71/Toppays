import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'
import { useArcWallet, useSpendableNative, useUsdcBalance } from '@/hooks/useArc'
import { useRoute } from '@/hooks/useRoute'
import { useSendUsdc } from '@/hooks/useSendUsdc'
import { useUniswapSwap } from '@/hooks/useUniswapSwap'
import { useTransactionHistory } from '@/hooks/useTransactionHistory'
import { formatNativeAsUsdc, formatUsdcRaw, shortAddress } from '@/lib/format'
import type { HistoryEntry } from '@/services/history'
import type { LocalSend } from '@/components/ActivityList'
import { AppShell } from '@/components/shell/AppShell'
import { navFor } from '@/components/shell/nav'
import { ActivityPage } from './ActivityPage'
import { BridgePage } from './BridgePage'
import { DashboardPage } from './DashboardPage'
import { LandingPage } from './LandingPage'
import { ReceivePage } from './ReceivePage'
import { SendPage } from './SendPage'
import { SettingsPage } from './SettingsPage'
import { SwapPage } from './SwapPage'

/**
 * App container. It owns the wallet, balance, history, send and swap state exactly as before; the pages
 * only present it. Navigating between pages never resets an in-flight payment or swap.
 */
export function Dashboard() {
  const wallet = useArcWallet()
  const { address, isConnected } = wallet
  const { route, navigate } = useRoute()
  const balance = useUsdcBalance(address)
  const spendable = useSpendableNative(address)

  const { refetch: refetchBalance } = balance
  const { refetch: refetchSpendable } = spendable
  const refreshBalances = useCallback(() => {
    void refetchBalance()
    void refetchSpendable()
  }, [refetchBalance, refetchSpendable])

  const history = useTransactionHistory(
    address,
    useCallback(
      (fresh: HistoryEntry[]) => {
        refreshBalances()
        for (const entry of fresh.filter((item) => item.direction === 'received')) {
          toast.success(`Received ${formatNativeAsUsdc(entry.amountNative)} USDC`, {
            description: `from ${shortAddress(entry.counterparty)}`,
          })
        }
      },
      [refreshBalances],
    ),
  )

  const send = useSendUsdc({ onConfirmed: refreshBalances })
  const swap = useUniswapSwap({ onSettled: refreshBalances })
  const { dismiss: dismissSwap } = swap
  const sendPhase = send.state.phase
  const { reset: resetSend, busy: sendBusy } = send

  // Account changes: tell the user, and drop any unsent review so it can never be signed for another account.
  const previousAddress = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (previousAddress.current && address && previousAddress.current !== address) {
      toast.info(`Wallet account changed to ${shortAddress(address)}`)
      resetSend()
      dismissSwap()
    }
    previousAddress.current = address
  }, [address, resetSend, dismissSwap])

  // Toasts for final send results.
  const lastToasted = useRef<string>('')
  useEffect(() => {
    const key = `${sendPhase}:${send.state.hash ?? ''}`
    if (key === lastToasted.current) return
    if (sendPhase === 'confirmed') toast.success('Payment confirmed onchain')
    if (sendPhase === 'failed') toast.error('Payment failed')
    if (sendPhase === 'confirmed' || sendPhase === 'failed') lastToasted.current = key
  }, [sendPhase, send.state.hash])

  // Leaving the Send page drops an unsent review or a finished result, but never an in-flight or unconfirmed payment.
  useEffect(() => {
    if (route !== 'send' && !sendBusy && sendPhase !== 'idle' && sendPhase !== 'unconfirmed') resetSend()
  }, [route, sendBusy, sendPhase, resetSend])

  // The page title follows the page.
  useEffect(() => {
    document.title = address ? `${navFor(route).title} · TopPay` : 'TopPay'
  }, [route, address])

  const finishSend = useCallback(() => {
    if (!sendBusy) resetSend()
    navigate('dashboard')
  }, [sendBusy, resetSend, navigate])

  const received = useMemo(() => history.entries.filter((entry) => entry.direction === 'received'), [history.entries])

  // A payment from this app that the chain has not finished (or that failed): real wallet and chain state only.
  const localSend: LocalSend | null = useMemo(() => {
    const { quote, hash, message } = send.state
    if (!quote) return null
    const amount = formatUsdcRaw(quote.amount.raw)
    if (sendPhase === 'awaiting-wallet' || sendPhase === 'pending') return { status: 'pending', amount, to: quote.to, hash, message: sendPhase === 'awaiting-wallet' ? 'Waiting for your wallet.' : 'Waiting for Arc Mainnet to include it.' }
    if (sendPhase === 'unconfirmed') return { status: 'unconfirmed', amount, to: quote.to, hash, message }
    if (sendPhase === 'failed' && hash) return { status: 'failed', amount, to: quote.to, hash, message }
    return null
  }, [send.state, sendPhase])

  if (!isConnected || !address) {
    return <LandingPage connecting={wallet.isConnecting} />
  }

  const banners = wallet.isWrongNetwork ? (
    <div role="alert" className="card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--danger)' }}>
      <p className="flex items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
        Your wallet is on a different network. Switch to Arc Mainnet (chain {ARC_MAINNET_CHAIN_ID}) to send. Balance and history still come from Arc Mainnet.
      </p>
      <button type="button" className="btn btn-primary shrink-0" onClick={wallet.switchToArc} disabled={wallet.isSwitching}>
        {wallet.isSwitching && <Loader2 className="size-4 animate-spin" />} Switch network
      </button>
      {wallet.switchError && (
        <p className="text-xs sm:basis-full" style={{ color: 'var(--danger)' }}>
          Could not switch: approve the request in your wallet, or add Arc Mainnet manually.
        </p>
      )}
    </div>
  ) : null

  return (
    <AppShell route={route} address={address} connectorName={wallet.connectorName} banners={banners}>
      {route === 'dashboard' && (
        <DashboardPage
          address={address}
          balance={balance.data}
          balanceLoading={balance.isLoading}
          balanceFailed={balance.isError && balance.data === undefined}
          onRetryBalance={() => void balance.refetch()}
          history={history}
          localSend={localSend}
        />
      )}
      {route === 'send' && (
        <SendPage
          sender={address}
          usdcBalance={balance.data}
          nativeBalance={spendable.data?.value}
          isWrongNetwork={wallet.isWrongNetwork}
          switching={wallet.isSwitching}
          onSwitchNetwork={wallet.switchToArc}
          send={send}
          onDone={finishSend}
        />
      )}
      {route === 'receive' && <ReceivePage address={address} balance={balance.data} incoming={received} />}
      {route === 'swap' && <SwapPage swap={swap} />}
      {route === 'bridge' && <BridgePage />}
      {route === 'activity' && <ActivityPage history={history} localSend={localSend} />}
      {route === 'settings' && <SettingsPage address={address} connectorName={wallet.connectorName} />}
    </AppShell>
  )
}
