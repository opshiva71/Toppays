import { ArrowLeftRight, Wallet } from 'lucide-react'

export type View = 'wallet' | 'swap'

const TABS: { id: View; label: string; Icon: typeof Wallet }[] = [
  { id: 'wallet', label: 'Wallet', Icon: Wallet },
  { id: 'swap', label: 'Swap', Icon: ArrowLeftRight },
]

/** Two-tab switch between the wallet dashboard and the Uniswap swap screen. */
export function ViewTabs({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <nav aria-label="Sections" className="card flex gap-1 p-1">
      {TABS.map(({ id, label, Icon }) => {
        const active = view === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active ? 'page' : undefined}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors"
            style={active ? { background: 'var(--ink)', color: '#fff' } : { color: 'var(--muted)' }}
          >
            <Icon className="size-4" /> {label}
          </button>
        )
      })}
    </nav>
  )
}
