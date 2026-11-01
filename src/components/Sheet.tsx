import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

interface SheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Bottom sheet on mobile, centered dialog on larger screens. Escape and backdrop click close it. */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-[#0d1b2f]/30 backdrop-blur-sm" />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl sm:rounded-3xl"
            style={{
              background: 'rgba(255,255,255,0.94)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              boxShadow: '0 24px 64px -16px rgba(18,45,69,0.35)',
            }}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <h2 className="display text-xl font-semibold">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="btn btn-ghost !min-h-11 !w-11 !px-0">
                <X className="size-5" />
              </button>
            </div>
            {/* Extra bottom space on phones keeps the primary button clear of the fixed Arc Studio badge. */}
            <div className="px-5 pb-[max(4.5rem,env(safe-area-inset-bottom))] sm:pb-6">{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
