import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 px-4 pb-24 pt-2 text-xs" style={{ color: 'var(--subtle)' }}>
      <Logo size={16} />
      <span>TOPpay · Send and receive USDC on Arc Mainnet</span>
    </footer>
  )
}
