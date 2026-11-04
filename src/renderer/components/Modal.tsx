import type { JSX, ReactNode } from 'react'
import { X } from 'lucide-react'

export default function Modal(options: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}): JSX.Element | null {
  if (!options.open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={options.onClose}
      />
      <div
        className="panel relative z-10 max-h-[88vh] overflow-auto fade-in"
        style={{ width: options.width ?? 720 }}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-line-soft">
          <div>
            <h2 className="text-[16px] font-semibold text-mist-300">{options.title}</h2>
            {options.description && (
              <p className="mt-1 text-[12px] text-mist-500">{options.description}</p>
            )}
          </div>
          <button className="text-mist-500 hover:text-mist-300" onClick={options.onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{options.children}</div>
        {options.footer && (
          <div className="px-6 py-4 border-t border-line-soft flex justify-end gap-2">
            {options.footer}
          </div>
        )}
      </div>
    </div>
  )
}
