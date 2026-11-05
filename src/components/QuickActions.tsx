import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Waypoints } from 'lucide-react'

const ACTIONS = [
  { href: '#/send', label: 'Send', Icon: ArrowUpRight },
  { href: '#/receive', label: 'Receive', Icon: ArrowDownLeft },
  { href: '#/swap', label: 'Swap', Icon: ArrowLeftRight },
  { href: '#/bridge', label: 'Bridge', Icon: Waypoints },
] as const

/** Four large, touch-friendly shortcuts. They are plain links, so they work with the keyboard and the back button. */
export function QuickActions() {
  return (
    <nav className="grid grid-cols-4 gap-2.5 sm:gap-3" aria-label="Quick actions">
      {ACTIONS.map(({ href, label, Icon }) => (
        <a key={label} href={href} className="tile" aria-label={label}>
          <span className="tile-icon">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          {label}
        </a>
      ))}
    </nav>
  )
}
