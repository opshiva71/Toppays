import type { Route } from '@/hooks/useRoute'
import { NAV } from './nav'

/** Mobile bottom navigation: all seven destinations, thumb-sized, clear of the Android and iPhone system bars. */
export function BottomNav({ route }: { route: Route }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t px-1.5 pt-1.5 lg:hidden"
      style={{
        borderColor: 'var(--border)',
        background: 'rgba(8,13,27,0.9)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
      }}
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-xl items-stretch">
        {NAV.map(({ route: target, short, Icon }) => (
          <a key={target} href={`#/${target}`} className="tab-link" aria-current={route === target ? 'page' : undefined}>
            <span className="tab-dot">
              <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="max-w-full truncate px-0.5">{short}</span>
          </a>
        ))}
      </div>
    </nav>
  )
}
