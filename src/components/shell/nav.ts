import { Activity, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, LayoutDashboard, Settings, Waypoints, type LucideIcon } from 'lucide-react'
import type { Route } from '@/hooks/useRoute'

export interface NavItem {
  route: Route
  label: string
  /** Short label for the mobile bottom bar. */
  short: string
  title: string
  subtitle: string
  Icon: LucideIcon
}

export const NAV: readonly NavItem[] = [
  { route: 'dashboard', label: 'Dashboard', short: 'Home', title: 'Dashboard', subtitle: 'Your balance and recent activity', Icon: LayoutDashboard },
  { route: 'send', label: 'Send', short: 'Send', title: 'Send USDC', subtitle: 'Pay any wallet on Arc Mainnet', Icon: ArrowUpRight },
  { route: 'receive', label: 'Receive', short: 'Receive', title: 'Receive USDC', subtitle: 'Share your address or QR code', Icon: ArrowDownLeft },
  { route: 'swap', label: 'Swap', short: 'Swap', title: 'Swap', subtitle: 'Trade tokens through Uniswap', Icon: ArrowLeftRight },
  { route: 'bridge', label: 'Bridge', short: 'Bridge', title: 'Bridge', subtitle: 'Move USDC across networks', Icon: Waypoints },
  { route: 'activity', label: 'Activity', short: 'Activity', title: 'Activity', subtitle: 'Every payment, read from the chain', Icon: Activity },
  { route: 'settings', label: 'Settings', short: 'Settings', title: 'Settings', subtitle: 'Wallet, network and security', Icon: Settings },
]

export const navFor = (route: Route): NavItem => NAV.find((item) => item.route === route) ?? NAV[0]
