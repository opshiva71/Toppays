import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ExternalLink, Loader2, ShieldAlert } from 'lucide-react'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { shortAddress } from '@/lib/format'
import { verifySwapContracts } from '@/services/swapTokens'
import { ARC_MAINNET_CHAIN_ID } from '../../../config/network'

/**
 * "Contracts verified" indicator. It runs real onchain checks (code exists at Uniswap's published
 * Arc addresses, token symbols and decimals match) and only turns green when every check passes.
 */
export function ContractBadge() {
  const [open, setOpen] = useState(false)
  const check = useQuery({ queryKey: ['swap-contract-check'], queryFn: verifySwapContracts, staleTime: 5 * 60_000, retry: 1 })

  const state = check.isLoading ? 'checking' : check.data?.ok ? 'ok' : 'failed'
  const label = state === 'checking' ? 'Checking contracts' : state === 'ok' ? 'Contracts verified' : 'Contract check failed'

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`badge ${state === 'ok' ? 'badge-success' : state === 'failed' ? 'badge-danger' : 'badge-neutral'} min-h-8 cursor-pointer px-3 text-xs`}
      >
        {state === 'checking' ? <Loader2 className="size-3.5 animate-spin" /> : state === 'ok' ? <CheckCircle2 className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
        {label}
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="inner mt-3 space-y-2 p-3 text-xs">
          <p style={{ color: 'var(--muted)' }}>
            Checked onchain just now: each address below is Uniswap's published V3 deployment on Arc Mainnet (also source-verified on Arc Explorer), holds live code with the functions TopPay calls, and the router and quoter both point at the same factory. Each token reports the expected symbol and decimals. This is not a code audit.
          </p>
          {check.data?.checks.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5">
                {item.state === 'ok' ? (
                  <CheckCircle2 className="size-3.5 shrink-0" style={{ color: 'var(--success)' }} />
                ) : (
                  <ShieldAlert className="size-3.5 shrink-0" style={{ color: 'var(--danger)' }} />
                )}
                <span className="truncate font-medium">{item.label}</span>
              </span>
              <a
                href={buildAddressExplorerUrl(ARC_MAINNET_CHAIN_ID, item.address)}
                target="_blank"
                rel="noopener noreferrer"
                title={item.detail}
                className="mono inline-flex shrink-0 items-center gap-1 underline-offset-2 hover:underline"
                style={{ color: 'var(--accent-hover)' }}
              >
                {shortAddress(item.address, 6, 4)} <ExternalLink className="size-3" />
              </a>
            </div>
          ))}
          {check.isError && <p style={{ color: 'var(--danger)' }}>Could not reach the Arc RPC to run the checks.</p>}
        </div>
      )}
    </div>
  )
}
