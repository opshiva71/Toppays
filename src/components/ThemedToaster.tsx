import { Toaster } from 'sonner'
import { useTheme } from '@/lib/theme'

export function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster position="top-center" theme={theme} offset={76} mobileOffset={68} />
}
