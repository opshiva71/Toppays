import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Radio } from 'lucide-react'
import { copyText, formatNativeAsUsdc, formatUsdcRaw, shortAddress } from '@/lib/format'
import type { HistoryEntry } from '@/services/history'

interface ReceiveSheetProps {
  address: string
  balance: bigint | undefined
  incoming: HistoryEntry[]
}

export function ReceiveSheet({ address, balance, incoming }: ReceiveSheetProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (await copyText(address)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Share this address or QR code to receive USDC on <strong>Arc Mainnet</strong>. Do not use it for other networks.
      </p>

      <div className="flex justify-center">
        <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--border)' }}>
          <QRCodeSVG value={address} size={188} level="M" marginSize={0} bgColor="#ffffff" fgColor="#122d45" title="Wallet address QR code" />
        </div>
      </div>

      <div className="inner p-3">
        <span className="label">Your address</span>
        <p className="mono mt-1 break-all text-sm">{address}</p>
      </div>

      <button type="button" className="btn btn-primary w-full" onClick={() => void copy()}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? 'Address copied' : 'Copy address'}
      </button>

      <div className="flex items-center justify-between text-sm">
        <span style={{ color: 'var(--muted)' }}>Current balance</span>
        <span className="font-semibold tabular-nums">{balance === undefined ? '…' : `${formatUsdcRaw(balance)} USDC`}</span>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5">
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
      </div>
    </div>
  )
}
