import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Info, Radio, Share2 } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'
import { copyText, formatNativeAsUsdc, formatUsdcRaw, shortAddress } from '@/lib/format'
import type { HistoryEntry } from '@/services/history'

interface ReceivePageProps {
  address: string
  balance: bigint | undefined
  incoming: HistoryEntry[]
}

export function ReceivePage({ address, balance, incoming }: ReceivePageProps) {
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    if (await copyText(address)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  const share = async () => {
    try {
      if (canShare) {
        await navigator.share({ title: 'My TopPay address', text: `Send USDC on Arc Mainnet to ${address}` })
      } else if (await copyText(address)) {
        setShared(true)
        setTimeout(() => setShared(false), 1800)
      }
    } catch {
      // The share sheet was dismissed. Nothing to do.
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <section className="card flex flex-col items-center p-6 text-center sm:p-8" aria-label="Receive USDC">
        <span className="badge badge-pending !px-3 !py-1">
          <TokenUSDC variant="branded" size={14} /> USDC on Arc Mainnet
        </span>

        {/* Gradient frame around a white tile so the QR code always scans. The code is the connected address. */}
        <div className="relative mt-6">
          <span className="glow-pulse absolute -inset-4 rounded-[2.5rem] blur-2xl" style={{ background: 'var(--grad)', opacity: 0.35 }} aria-hidden="true" />
          <div className="relative rounded-[1.75rem] p-[3px]" style={{ background: 'var(--grad)' }}>
            <div className="rounded-[1.6rem] bg-white p-5">
              <QRCodeSVG value={address} size={208} level="M" marginSize={0} bgColor="#ffffff" fgColor="#0b1220" title="QR code of your wallet address" />
            </div>
          </div>
        </div>

        <p className="mt-6 text-sm" style={{ color: 'var(--muted)' }}>
          Scan to send USDC to this wallet
        </p>
        <p className="mono mt-2 break-all text-sm font-medium" data-testid="receive-address">
          {address}
        </p>

        <div className="mt-5 grid w-full max-w-sm grid-cols-2 gap-2.5">
          <button type="button" className="btn btn-primary" onClick={() => void copy()} aria-label={copied ? 'Copied' : 'Copy address'}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void share()}>
            {shared ? <Check className="size-4" /> : <Share2 className="size-4" />}
            {shared ? 'Copied' : 'Share'}
          </button>
        </div>
      </section>

      <div className="space-y-4">
        <section className="card p-5" aria-label="Receiving information">
          <h2 className="display text-lg font-semibold">Receiving info</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: 'var(--muted)' }}>Current balance</dt>
              <dd className="font-semibold tabular-nums">{balance === undefined ? '…' : `${formatUsdcRaw(balance)} USDC`}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: 'var(--muted)' }}>Network</dt>
              <dd className="font-semibold">Arc Mainnet · {ARC_MAINNET_CHAIN_ID}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: 'var(--muted)' }}>Arrives</dt>
              <dd className="font-semibold">In the next block</dd>
            </div>
          </dl>
        </section>

        <section className="card p-5" aria-label="How to receive">
          <h2 className="flex items-center gap-2 display text-lg font-semibold">
            <Info className="size-4" style={{ color: 'var(--accent-hover)' }} /> How to receive
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm" style={{ color: 'var(--ink-2)' }}>
            <li>The sender must choose <strong>Arc Mainnet</strong> and <strong>USDC</strong>.</li>
            <li>Do not use this address on other networks: funds sent there may be lost.</li>
            <li>Payments appear below and on Activity automatically once they are in a block.</li>
          </ul>
        </section>

        <section className="card p-5" aria-label="Latest incoming payments">
          <div className="mb-3 flex items-center gap-1.5">
            <Radio className="size-3.5" style={{ color: 'var(--success)' }} />
            <span className="label">Latest incoming (live)</span>
          </div>
          {incoming.length === 0 ? (
            <p className="inner p-3 text-xs" style={{ color: 'var(--muted)' }}>
              No incoming payments found yet. New ones appear here automatically after they are included in a block.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {incoming.slice(0, 3).map((entry) => (
                <li key={entry.id} className="inner flex items-center justify-between p-3 text-sm">
                  <span className="mono text-xs" style={{ color: 'var(--muted)' }}>
                    from {shortAddress(entry.counterparty)}
                  </span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--success)' }}>
                    +{formatNativeAsUsdc(entry.amountNative)} USDC
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
