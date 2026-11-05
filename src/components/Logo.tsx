import { useId } from 'react'

/** TopPay mark: a "T" with a coin dot on a blue-to-violet tile. Decorative; the wordmark carries the name. */
export function Logo({ size = 32 }: { size?: number }) {
  const gradientId = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="2" y1="1" x2="26" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="9" fill={`url(#${gradientId})`} />
      <rect x="0.5" y="0.5" width="27" height="27" rx="8.5" stroke="rgba(255,255,255,0.28)" />
      <path d="M7.5 9.5h13" stroke="#dbeafe" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14 9.5v9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="14" cy="21" r="1.5" fill="#fde68a" />
    </svg>
  )
}

/** "Top" in white, "Pay" in the brand gradient. Optionally shows the tagline underneath. */
export function Wordmark({ size = 'md', tagline = false }: { size?: 'sm' | 'md' | 'lg'; tagline?: boolean }) {
  const mark = size === 'lg' ? 44 : size === 'sm' ? 28 : 36
  const text = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-[1.375rem]'
  return (
    <span className="flex shrink-0 items-center gap-2.5" aria-label="TopPay">
      <Logo size={mark} />
      <span className="flex flex-col" aria-hidden="true">
        <span className={`display font-bold leading-none tracking-tight ${text}`}>
          Top<span className="text-grad">Pay</span>
        </span>
        {tagline && (
          <span className="mt-1.5 whitespace-nowrap text-[11px] font-medium leading-none tracking-[0.01em]" style={{ color: 'var(--muted)' }}>
            Send. Receive. Move Money.
          </span>
        )}
      </span>
    </span>
  )
}
