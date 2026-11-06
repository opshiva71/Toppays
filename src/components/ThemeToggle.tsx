import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'

/** One-tap theme switch for the top bar. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button type="button" onClick={toggle} aria-label={`Switch to ${next} theme`} className="btn btn-ghost !min-h-10 !w-10 !rounded-full !px-0">
      {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  )
}

/** Dark / Light choice for Settings. */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="segmented" role="group" aria-label="Theme">
      {(['dark', 'light'] as const).map((value) => (
        <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)} className="inline-flex items-center gap-1.5">
          {value === 'dark' ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
          {value === 'dark' ? 'Dark' : 'Light'}
        </button>
      ))}
    </div>
  )
}
