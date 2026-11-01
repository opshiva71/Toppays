import { CheckCircle2, Clock3, MinusCircle, TriangleAlert, XCircle } from 'lucide-react'

export type BadgeStatus = 'confirmed' | 'pending' | 'failed' | 'cancelled' | 'unconfirmed'

const STYLE: Record<BadgeStatus, { className: string; label: string; Icon: typeof CheckCircle2 }> = {
  confirmed: { className: 'badge-success', label: 'Confirmed', Icon: CheckCircle2 },
  pending: { className: 'badge-pending', label: 'Pending', Icon: Clock3 },
  failed: { className: 'badge-danger', label: 'Failed', Icon: XCircle },
  cancelled: { className: 'badge-neutral', label: 'Cancelled', Icon: MinusCircle },
  unconfirmed: { className: 'badge-warning', label: 'Unconfirmed', Icon: TriangleAlert },
}

/** Compact status pill. The status must come from real chain or wallet state, never a timer. */
export function StatusBadge({ status, label }: { status: BadgeStatus; label?: string }) {
  const { className, label: defaultLabel, Icon } = STYLE[status]
  return (
    <span className={`badge ${className}`}>
      <Icon className="size-3" aria-hidden="true" />
      {label ?? defaultLabel}
    </span>
  )
}
