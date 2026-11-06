import { useId } from 'react'

/** TopPay mark: a rounded blue-to-violet "T" (the product mark). Decorative; the wordmark carries the name. */
export function Logo({ size = 32 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="248 170 560 560" fill="none" aria-hidden="true" className="shrink-0">
      <defs>
      <linearGradient id={`${id}bar`} x1="270" y1="298" x2="640" y2="330" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#63D2F7"/><stop offset="0.55" stopColor="#4BA6F1"/><stop offset="1" stopColor="#2E62DB"/></linearGradient>
      <linearGradient id={`${id}front`} x1="470" y1="236" x2="590" y2="676" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#8AB8FF"/><stop offset="0.38" stopColor="#5B8DEE"/><stop offset="0.78" stopColor="#6A4EDB"/><stop offset="1" stopColor="#5230BE"/></linearGradient>
      <linearGradient id={`${id}arm`} x1="610" y1="298" x2="790" y2="298" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#7C5BE6" stopOpacity="0"/><stop offset="1" stopColor="#6A3FD3" stopOpacity="0.95"/></linearGradient>
      <linearGradient id={`${id}stem`} x1="500" y1="0" x2="606" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#2A1FA6" stopOpacity="0"/><stop offset="1" stopColor="#2A1FA6" stopOpacity="0.6"/></linearGradient>
      <linearGradient id={`${id}sheen`} x1="480" y1="228" x2="560" y2="400" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity="0.34"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
      <filter id={`${id}soft`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
      <clipPath id={`${id}clipBar`}><path d="M347.5 220 H650 V375 H347.5 A77.5 77.5 0 0 1 347.5 220 Z"/></clipPath>
      <clipPath id={`${id}clipFront`}><path d="M452 603.5 V392 C452 292 528 220 632 220 H710 A77.5 77.5 0 0 1 710 375 H642 C617 375 605 388 605 412 V603.5 A76.5 76.5 0 0 1 452 603.5 Z"/></clipPath>
      </defs>
      <path d="M347.5 220 H650 V375 H347.5 A77.5 77.5 0 0 1 347.5 220 Z" fill={`url(#${id}bar)`}/>
      <g clipPath={`url(#${id}clipBar)`}><path d="M452 603.5 V392 C452 292 528 220 632 220 H710 A77.5 77.5 0 0 1 710 375 H642 C617 375 605 388 605 412 V603.5 A76.5 76.5 0 0 1 452 603.5 Z" fill="#1B2FB8" fillOpacity="0.6" transform="translate(-14 10)" filter={`url(#${id}soft)`}/></g>
      <path d="M452 603.5 V392 C452 292 528 220 632 220 H710 A77.5 77.5 0 0 1 710 375 H642 C617 375 605 388 605 412 V603.5 A76.5 76.5 0 0 1 452 603.5 Z" fill={`url(#${id}front)`}/>
      <g clipPath={`url(#${id}clipFront)`}><rect x="548" y="430" width="70" height="260" fill="#2A1FA6" fillOpacity="0.62" filter={`url(#${id}soft)`}/><rect x="600" y="210" width="200" height="180" fill={`url(#${id}arm)`}/><ellipse cx="548" cy="264" rx="100" ry="34" fill="#fff" fillOpacity="0.32" filter={`url(#${id}soft)`}/></g>
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
