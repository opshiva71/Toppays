/** TopPay mark: a "T" with a coin dot. Decorative; the wordmark next to it carries the name. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="9" fill="#122d45" />
      <path d="M7.5 9.5h13" stroke="#acc6e9" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14 9.5v10" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="14" cy="20.5" r="1.4" fill="#acc6e9" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo />
      <span className="display text-xl font-semibold">TopPay</span>
    </span>
  )
}
