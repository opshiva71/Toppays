import { useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { ARC_EXPLORER_URL, ARC_MAINNET_CHAIN_ID, ARC_RPC_URLS, ARC_USDC } from '../../config/network'
import { useContractStatus, useRpcHealth } from '@/hooks/useArc'
import { copyText, shortAddress } from '@/lib/format'
import { StatusBadge } from './StatusBadge'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="label">{title}</h3>
      <div className="inner divide-y divide-[color:var(--border)] px-4 text-sm">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2.5">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
    </div>
  )
}

function CopyValue({ value, display }: { value: string; display: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void copyText(value).then((ok) => {
          if (!ok) return
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="mono inline-flex min-h-11 items-center gap-1.5 text-xs"
      aria-label={`Copy ${value}`}
    >
      {display}
      {copied ? <Check className="size-3.5" style={{ color: 'var(--success)' }} /> : <Copy className="size-3.5" />}
    </button>
  )
}

/** Developer-facing details: network, RPC endpoints and the optional receipt contract. */
export function DeveloperSettings() {
  const { data: health } = useRpcHealth()
  const { data: contract } = useContractStatus()

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Technical details for operators. Payments are plain native USDC transfers and work without any of the optional items below.
      </p>

      <Section title="Network">
        <Row label="Name">Arc Mainnet</Row>
        <Row label="Chain ID">
          <span className="tabular-nums">{ARC_MAINNET_CHAIN_ID}</span>
        </Row>
        <Row label="Gas token">USDC</Row>
        <Row label="Explorer">
          <a href={ARC_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
            {new URL(ARC_EXPLORER_URL).host} <ExternalLink className="size-3" />
          </a>
        </Row>
        <Row label="USDC (ERC-20)">
          <CopyValue value={ARC_USDC.address} display={shortAddress(ARC_USDC.address, 8, 6)} />
        </Row>
      </Section>

      <Section title="RPC">
        <Row label="Status">
          {!health ? (
            <span style={{ color: 'var(--subtle)' }}>Checking…</span>
          ) : health.ok ? (
            <span className="tabular-nums" style={{ color: 'var(--success)' }}>
              Online · block {health.blockNumber.toString()} · {health.latencyMs} ms
            </span>
          ) : (
            <span style={{ color: 'var(--danger)' }}>{health.message}</span>
          )}
        </Row>
        {ARC_RPC_URLS.map((url, index) => (
          <Row key={url} label={index === 0 ? 'Primary' : `Backup ${index}`}>
            <span className="mono text-xs" title={url}>
              {new URL(url).host}
            </span>
          </Row>
        ))}
        <p className="py-3 text-xs" style={{ color: 'var(--subtle)' }}>
          Set VITE_ARC_RPC_URL or VITE_ARC_RPC_FALLBACK_URLS and rebuild to use your own endpoints (https only).
        </p>
      </Section>

      <Section title="Receipt contract (optional)">
        <Row label="Status">
          {!contract ? (
            <span style={{ color: 'var(--subtle)' }}>Checking…</span>
          ) : contract.state === 'not-configured' ? (
            <StatusBadge status="cancelled" label="Not configured" />
          ) : contract.state === 'invalid' ? (
            <StatusBadge status="failed" label="Invalid address" />
          ) : contract.state === 'verified' ? (
            <StatusBadge status="confirmed" label="Verified" />
          ) : contract.state === 'no-code' ? (
            <StatusBadge status="failed" label="No contract at address" />
          ) : contract.state === 'wrong-contract' ? (
            <StatusBadge status="failed" label="Unrecognized contract" />
          ) : (
            <StatusBadge status="unconfirmed" label="Unreachable" />
          )}
        </Row>
        {contract && 'address' in contract && (
          <Row label="Address">
            <a
              href={buildAddressExplorerUrl(ARC_MAINNET_CHAIN_ID, contract.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="mono inline-flex min-h-11 items-center gap-1 text-xs"
              style={{ color: 'var(--accent-hover)' }}
            >
              {shortAddress(contract.address, 8, 6)} <ExternalLink className="size-3" />
            </a>
          </Row>
        )}
        <p className="py-3 text-xs" style={{ color: 'var(--subtle)' }}>
          {contract?.state === 'invalid'
            ? contract.reason
            : 'The optional ArcSend contract (v2) adds memo receipts, batch payments, payment requests and escrow. To use one, deploy it yourself, set VITE_ARCSEND_CONTRACT_ADDRESS and rebuild. The app checks the address onchain before showing it as verified.'}
        </p>
      </Section>
    </div>
  )
}
