import type { JSX } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/format'

export default function Toasts(): JSX.Element {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)

  return (
    <div className="fixed bottom-24 right-6 z-50 flex flex-col gap-2 w-[340px]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'fade-in panel px-3.5 py-3 flex items-start gap-2.5 text-[12.5px] leading-relaxed',
            toast.type === 'error' && 'border-red-500/30',
            toast.type === 'success' && 'border-emerald-500/30'
          )}
        >
          {toast.type === 'error' ? (
            <XCircle size={16} className="text-red-400 mt-[1px] shrink-0" />
          ) : toast.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-400 mt-[1px] shrink-0" />
          ) : (
            <Info size={16} className="text-amber-brand mt-[1px] shrink-0" />
          )}
          <span className="flex-1 text-mist-300 break-words">{toast.message}</span>
          <button
            className="text-mist-500 hover:text-mist-300 shrink-0"
            onClick={() => dismiss(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
