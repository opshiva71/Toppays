import { useMemo } from 'react'
import { useConnect } from 'wagmi'
import { ExternalLink, Loader2, ShieldCheck, Wallet } from 'lucide-react'
import { ARC_MAINNET_CHAIN_ID } from '../../config/network'

function friendlyConnectError(error: Error | null): string | null {
  if (!error) return null
  const text = error.message.toLowerCase()
  if (text.includes('rejected') || text.includes('denied')) return 'Connection request was rejected in your wallet.'
  if (text.includes('already pending')) return 'A wallet request is already open. Check your wallet extension.'
  return 'Could not connect to the wallet. Please try again.'
}

/** Wallet picker. Lists every EIP-6963 browser wallet found, falling back to the generic injected provider. */
/** EIP-6963 icons come from wallet extensions. Only render data-image or https URLs. */
function safeIcon(icon: string | undefined): string | undefined {
  if (!icon) return undefined
  return /^data:image\/(png|svg\+xml|webp|jpeg|gif);/i.test(icon) || icon.startsWith('https://') ? icon : undefined
}

export function ConnectWallet() {
  const { connectors, connect, isPending, error, variables } = useConnect()

  const options = useMemo(() => {
    const discovered = connectors.filter((connector) => connector.id !== 'injected')
    return discovered.length > 0 ? discovered : connectors
  }, [connectors])

  const hasProvider = typeof window !== 'undefined' && Boolean((window as { ethereum?: unknown }).ethereum)
  const noWallet = options.length === 0 || (options.length === 1 && options[0].id === 'injected' && !hasProvider)
  const message = friendlyConnectError(error)

  return (
    <section className="card mx-auto w-full max-w-md p-6 sm:p-8">
      <div className="mb-5 flex size-12 items-center justify-center rounded-2xl" style={{ background: 'var(--accent)' }}>
        <Wallet className="size-6 text-white" />
      </div>
      <h1 className="display text-balance text-3xl font-semibold">Send and receive USDC on Arc</h1>
      <p className="mt-2 text-pretty text-sm" style={{ color: 'var(--muted)' }}>
        Connect MetaMask or another browser wallet. TopPay never asks for your seed phrase or private key.
      </p>

      <div className="mt-6 space-y-2">
        {noWallet ? (
          <div className="inner p-4 text-sm" style={{ color: 'var(--ink-2)' }}>
            No browser wallet detected. Install a wallet extension, then reload this page.
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 font-semibold"
              style={{ color: 'var(--accent-hover)' }}
            >
              Get MetaMask <ExternalLink className="size-3.5" />
            </a>
          </div>
        ) : (
          options.map((connector) => {
            const pending = isPending && variables?.connector === connector
            return (
              <button
                key={connector.uid}
                type="button"
                disabled={isPending}
                onClick={() => connect({ connector, chainId: ARC_MAINNET_CHAIN_ID })}
                className="btn btn-primary w-full justify-between"
              >
                <span className="flex items-center gap-2.5">
                  {safeIcon(connector.icon) ? (
                    <img src={safeIcon(connector.icon)} alt="" className="size-5 rounded" />
                  ) : (
                    <Wallet className="size-5" />
                  )}
                  {connector.id === 'injected' ? 'Browser wallet' : connector.name}
                </span>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <span className="text-xs opacity-70">Connect</span>}
              </button>
            )
          })
        )}
      </div>

      {message && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
          {message}
        </p>
      )}

      <p className="mt-5 flex items-start gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Arc Mainnet moves real USDC. Payments are signed in your wallet and cannot be reversed.
      </p>
    </section>
  )
}
