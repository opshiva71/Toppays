/** TOPpay mark: a "T" on a deep-blue tile with a coin dot. Decorative; the wordmark next to it carries the name. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="toppay-tile" x1="3" y1="2" x2="25" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1d5a8f" />
          <stop offset="1" stopColor="#0f2740" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="9" fill="url(#toppay-tile)" />
      <rect x="0.5" y="0.5" width="27" height="27" rx="8.5" stroke="rgba(255,255,255,0.22)" />
      <path d="M7.5 9.5h13" stroke="#b9d4f2" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14 9.5v9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="14" cy="21" r="1.5" fill="#ffd28a" />
    </svg>
  )
}

/** "TOP" in bold navy, "pay" in lighter brand blue. Reads as one word: TOPpay. */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={`flex shrink-0 items-center ${size === 'sm' ? 'gap-2' : 'gap-2 sm:gap-2.5 [&_svg]:size-7 sm:[&_svg]:size-[34px]'}`}
      aria-label="TOPpay"
    >
      <Logo size={size === 'sm' ? 24 : 34} />
      <span
        className={`display flex items-baseline leading-none tracking-tight ${size === 'sm' ? 'text-base' : 'text-xl sm:text-[1.4rem]'}`}
        aria-hidden="true"
      >
        <span className="font-extrabold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          TOP
        </span>
        <span className="font-semibold" style={{ color: 'var(--accent-hover)', letterSpacing: '-0.01em' }}>
          pay
        </span>
      </span>
    </span>
  )
}
