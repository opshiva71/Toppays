import { useDisconnect } from 'wagmi'
import { LogOut, SlidersHorizontal } from 'lucide-react'
import { shortAddress } from '@/lib/format'
import { Wordmark } from './Logo'

interface HeaderProps {
  address?: string
  connectorName?: string
  onOpenSettings: () => void
}

export function Header({ address, connectorName, onOpenSettings }: HeaderProps) {
  const { disconnect } = useDisconnect()

  return (
    <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pb-3 pt-5 sm:pt-7">
      <Wordmark />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings and developer info"
          className="chip !size-11 justify-center"
        >
          <SlidersHorizontal className="size-[18px]" />
        </button>
        {address && (
          <div className="chip py-0.5 pl-3.5 pr-0.5 text-xs font-semibold" title={connectorName}>
            <span className="mono tabular-nums">{shortAddress(address)}</span>
            <button
              type="button"
              onClick={() => disconnect()}
              aria-label="Disconnect wallet"
              className="btn btn-ghost !min-h-11 !w-11 !rounded-full !px-0"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
