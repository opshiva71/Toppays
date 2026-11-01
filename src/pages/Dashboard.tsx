import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'
import { useArcWallet, useSpendableNative, useUsdcBalance } from '@/hooks/useArc'
import { useSendUsdc } from '@/hooks/useSendUsdc'
import { useTransactionHistory } from '@/hooks/useTransactionHistory'
import { formatNativeAsUsdc, shortAddress } from '@/lib/format'
import type { HistoryEntry } from '@/services/history'
import { BalanceCard } from '@/components/BalanceCard'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { ActionCards } from '@/components/ActionCards'
import { DeveloperSettings } from '@/components/DeveloperSettings'
import { NetworkInfo } from '@/components/NetworkInfo'
import { StatusBadge } from '@/components/StatusBadge'
import { ReceiveSheet } from '@/components/ReceiveSheet'
import { SendSheet } from '@/components/SendSheet'
import { Sheet } from '@/components/Sheet'
import { TransactionList } from '@/components/TransactionList'

export function Dashboard() {
  const wallet = useArcWallet()
  const { address, isConnected } = wallet
  const balance = useUsdcBalance(address)
  const spendable = useSpendableNative(address)
  const [sendOpen, setSendOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setSettingsOpen(true), [])

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
  const sendPhase = send.state.phase
  const { reset: resetSend, busy: sendBusy } = send

  // Account changes: tell the user, and drop any unsent review so it can never be signed for another account.
  const previousAddress = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (previousAddress.current && address && previousAddress.current !== address) {
      toast.info(`Wallet account changed to ${shortAddress(address)}`)
      resetSend()
      setSendOpen(false)
    }
    previousAddress.current = address
  }, [address, resetSend])

  // Toasts for final send results.
  const lastToasted = useRef<string>('')
  useEffect(() => {
    const key = `${sendPhase}:${send.state.hash ?? ''}`
    if (key === lastToasted.current) return
    if (sendPhase === 'confirmed') toast.success('Payment confirmed onchain')
    if (sendPhase === 'failed') toast.error('Payment failed')
    if (sendPhase === 'confirmed' || sendPhase === 'failed') lastToasted.current = key
  }, [sendPhase, send.state.hash])

  const closeSend = useCallback(() => {
    setSendOpen(false)
    if (!sendBusy) resetSend()
  }, [sendBusy, resetSend])

  const received = useMemo(() => history.entries.filter((entry) => entry.direction === 'received'), [history.entries])
  const trackingSend = !sendOpen && (sendPhase === 'awaiting-wallet' || sendPhase === 'pending' || sendPhase === 'unconfirmed')

  if (!isConnected || !address) {
    return (
      <div className="min-h-dvh">
        <Header onOpenSettings={openSettings} />
        <main className="px-4 pb-16 pt-8 sm:pt-16">
          {wallet.isConnecting ? (
            <div className="flex justify-center pt-24">
              <Loader2 className="size-6 animate-spin" style={{ color: 'var(--subtle)' }} />
            </div>
          ) : (
            <ConnectWallet />
          )}
        </main>
        <Footer />
        <Sheet open={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
          <DeveloperSettings />
        </Sheet>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <Header address={address} connectorName={wallet.connectorName} onOpenSettings={openSettings} />
      <main className="mx-auto w-full max-w-2xl space-y-3 px-4 pb-6 sm:space-y-4">
        {wallet.isWrongNetwork && (
          <div role="alert" className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--danger)' }}>
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
              Your wallet is on a different network. Switch to Arc Mainnet (chain {ARC_MAINNET_CHAIN_ID}) to send. Balance and history below still come from Arc Mainnet.
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
        )}

        <BalanceCard
          address={address}
          balance={balance.data}
          loading={balance.isLoading}
          failed={balance.isError && balance.data === undefined}
          onRetry={() => void balance.refetch()}
        />

        <ActionCards
          onSend={() => setSendOpen(true)}
          onReceive={() => setReceiveOpen(true)}
          sendDisabled={balance.data === undefined}
        />

        {trackingSend && (
          <button
            type="button"
            onClick={() => setSendOpen(true)}
            className="card flex w-full items-center justify-between gap-3 p-4 text-left text-sm"
          >
            <span className="flex items-center gap-2 font-semibold">
              <StatusBadge status={sendPhase === 'unconfirmed' ? 'unconfirmed' : 'pending'} />
              {sendPhase === 'unconfirmed' ? 'Payment not confirmed yet' : 'Payment in progress'}
            </span>
            <span style={{ color: 'var(--accent-hover)' }}>View</span>
          </button>
        )}

        <TransactionList history={history} />
        <NetworkInfo onOpenSettings={openSettings} />
      </main>
      <Footer />

      <Sheet open={sendOpen} title="Send USDC" onClose={closeSend}>
        <SendSheet
          sender={address}
          usdcBalance={balance.data}
          nativeBalance={spendable.data?.value}
          isWrongNetwork={wallet.isWrongNetwork}
          switching={wallet.isSwitching}
          onSwitchNetwork={wallet.switchToArc}
          send={send}
          onDone={closeSend}
        />
      </Sheet>

      <Sheet open={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
        <DeveloperSettings />
      </Sheet>

      <Sheet open={receiveOpen} title="Receive USDC" onClose={() => setReceiveOpen(false)}>
        <ReceiveSheet address={address} balance={balance.data} incoming={received} />
      </Sheet>
    </div>
  )
}
