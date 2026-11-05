import { useEffect } from 'react'
import { Dashboard } from '@/pages/Dashboard'

export default function App() {
  // Fade out the CSS boot screen from index.html once the app has mounted.
  useEffect(() => {
    const boot = document.getElementById('boot')
    if (!boot) return
    boot.classList.add('boot-hide')
    const timer = setTimeout(() => boot.remove(), 500)
    return () => clearTimeout(timer)
  }, [])

  return <Dashboard />
}
