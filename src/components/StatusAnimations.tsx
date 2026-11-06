import { AlertTriangle, XCircle } from 'lucide-react'

/** Spinning gradient ring shown while a transaction is waiting for the wallet or the chain. */
export function ProcessingOrb() {
  return (
    <div className="relative size-24" role="img" aria-label="Processing">
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: 'conic-gradient(from 0deg, transparent 0deg, #3b82f6 160deg, #7c3aed 320deg, transparent 360deg)', animation: 'ring-spin 1.1s linear infinite', mask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))', WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))' }}
      />
      <span className="glow-pulse absolute inset-3 rounded-full blur-md" style={{ background: 'var(--grad)', opacity: 0.55 }} />
      <span className="absolute inset-[14px] flex items-center justify-center rounded-full" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <span className="size-3 rounded-full" style={{ background: 'var(--grad)' }} />
      </span>
    </div>
  )
}

/** A check that draws itself inside expanding rings. Only mount it after the chain confirmed the transaction. */
export function SuccessCheck() {
  return (
    <div className="relative flex size-24 items-center justify-center" role="img" aria-label="Confirmed">
      {[0, 1].map((i) => (
        <span
          key={i}
          className="ripple-ring absolute inset-2 rounded-full border-2"
          style={{ borderColor: 'var(--success)', animation: `ripple 1.8s ease-out ${i * 0.7}s infinite` }}
        />
      ))}
      <span className="pop-in relative flex size-[72px] items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg, #10b981, #34d399)', boxShadow: '0 16px 40px -12px rgba(16,185,129,0.7)' }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="24" strokeDashoffset="24" style={{ animation: 'draw-check 520ms 200ms ease-out forwards' }} />
        </svg>
      </span>
    </div>
  )
}

export function FailureMark({ cancelled = false, warning = false }: { cancelled?: boolean; warning?: boolean }) {
  const color = warning ? 'var(--warning)' : cancelled ? 'var(--subtle)' : 'var(--danger)'
  return (
    <span className="shake flex size-20 items-center justify-center rounded-full" style={{ background: 'var(--fill)', border: `1px solid ${color}`, animation: 'shake 360ms ease-in-out 1' }} role="img" aria-label={warning ? 'Not confirmed' : cancelled ? 'Cancelled' : 'Failed'}>
      {warning ? <AlertTriangle className="size-9" style={{ color }} /> : <XCircle className="size-9" style={{ color }} />}
    </span>
  )
}
