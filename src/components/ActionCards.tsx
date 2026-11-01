import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'

interface ActionCardsProps {
  onSend: () => void
  onReceive: () => void
  sendDisabled: boolean
}

export function ActionCards({ onSend, onReceive, sendDisabled }: ActionCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button type="button" aria-label="Send" onClick={onSend} disabled={sendDisabled} className="action-card action-card-primary">
        <span className="flex size-10 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.14)' }}>
          <ArrowUpRight className="size-5" />
        </span>
        <span>
          <span className="display block text-xl font-semibold">Send</span>
          <span className="mt-0.5 block text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Pay any wallet
          </span>
        </span>
      </button>

      <button type="button" aria-label="Receive" onClick={onReceive} className="action-card action-card-secondary">
        <span className="flex size-10 items-center justify-center rounded-full" style={{ background: 'rgba(26,128,71,0.12)' }}>
          <ArrowDownLeft className="size-5" style={{ color: 'var(--success)' }} />
        </span>
        <span>
          <span className="display block text-xl font-semibold">Receive</span>
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--muted)' }}>
            Address and QR code
          </span>
        </span>
      </button>
    </div>
  )
}
