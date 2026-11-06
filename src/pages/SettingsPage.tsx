import { useState } from 'react'
import { useDisconnect } from 'wagmi'
import { Check, Copy, ExternalLink, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { ARC_EXPLORER_URL, ARC_MAINNET_CHAIN_ID } from '../../config/network'
import { useRpcHealth } from '@/hooks/useArc'
import { avatarGradient } from '@/lib/avatar'
import { copyText } from '@/lib/format'
import { DeveloperSettings, Row, Section } from '@/components/DeveloperSettings'
import { ThemeSwitch } from '@/components/ThemeToggle'
import { useTheme } from '@/lib/theme'

interface SettingsPageProps {
  address: string
  connectorName?: string
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="display mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export function SettingsPage({ address, connectorName }: SettingsPageProps) {
  const { disconnect } = useDisconnect()
  const { theme } = useTheme()
  const { data: health } = useRpcHealth()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (await copyText(address)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Card title="Wallet">
        <div className="flex items-center gap-3">
          <span className="size-12 shrink-0 rounded-2xl ring-2 ring-white/10" style={{ background: avatarGradient(address) }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{connectorName ?? 'Browser wallet'}</p>
            <p className="mono truncate text-xs" style={{ color: 'var(--muted)' }} title={address}>
              {address}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy address'}
          </button>
          <a className="btn btn-secondary" href={buildAddressExplorerUrl(ARC_MAINNET_CHAIN_ID, address)} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" /> View on explorer
          </a>
          <button type="button" className="btn btn-secondary" onClick={() => disconnect()} style={{ color: 'var(--danger)' }}>
            <LogOut className="size-4" /> Disconnect
          </button>
        </div>
      </Card>

      <Card title="Network">
        <Section title="Arc Mainnet">
          <Row label="Network">Arc Mainnet</Row>
          <Row label="Chain ID">
            <span className="tabular-nums">{ARC_MAINNET_CHAIN_ID}</span>
          </Row>
          <Row label="Gas token">USDC</Row>
          <Row label="RPC status">
            {!health ? (
              <span style={{ color: 'var(--subtle)' }}>Checking…</span>
            ) : health.ok ? (
              <span className="tabular-nums" style={{ color: 'var(--success)' }}>
                Connected · {health.latencyMs} ms · block {health.blockNumber.toString()}
              </span>
            ) : (
              <span style={{ color: 'var(--danger)' }}>{health.message}</span>
            )}
          </Row>
          <Row label="Explorer">
            <a href={ARC_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
              {new URL(ARC_EXPLORER_URL).host} <ExternalLink className="size-3" />
            </a>
          </Row>
        </Section>
      </Card>

      <Card title="Appearance">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="tile-icon !size-10 !rounded-xl" aria-hidden="true">
              {theme === 'dark' ? <Moon className="size-5" /> : <Sun className="size-5" />}
            </span>
            <div>
              <p className="text-sm font-semibold">{theme === 'dark' ? 'Dark Premium' : 'Light'} theme</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Dark is the default. Your choice is remembered on this device.
              </p>
            </div>
          </div>
          <ThemeSwitch />
        </div>
      </Card>

      <Card title="Security">
        <ul className="space-y-2.5 text-sm" style={{ color: 'var(--ink-2)' }}>
          {[
            'TopPay never asks for your seed phrase or private key. Only your wallet signs.',
            'Every payment and swap needs your approval in the wallet, showing the exact amount.',
            'Swaps are simulated against Arc first, and approvals are for exactly the swap amount, never unlimited.',
            'Confirmed means the transaction was included onchain. Transfers cannot be reversed, so check the address before you send.',
          ].map((line) => (
            <li key={line} className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--success)' }} aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Developer">
        <DeveloperSettings hideNetwork />
      </Card>
    </div>
  )
}
