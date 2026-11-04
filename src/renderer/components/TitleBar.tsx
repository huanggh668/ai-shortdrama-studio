import type { JSX } from 'react'
import { Sparkles } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'

export default function TitleBar(): JSX.Element {
  const project = useAppStore((state) => state.project)
  const dirty = useAppStore((state) => state.dirty)
  const isMac = navigator.userAgent.includes('Mac')

  return (
    <header
      className={`app-drag shrink-0 h-11 flex items-center border-b border-line-soft bg-ink-950/70 backdrop-blur ${
        isMac ? 'pl-24 pr-4' : 'pl-4 pr-40'
      }`}
    >
      <div className="flex items-center gap-2.5 text-[12.5px] tracking-wide min-w-0">
        <span className="h-5 w-5 rounded-md bg-gradient-to-br from-amber-brand to-orange-600 grid place-items-center shadow-[0_4px_12px_rgba(245,165,36,0.35)]">
          <Sparkles size={12} className="text-ink-950" strokeWidth={2.4} />
        </span>
        <span className="font-semibold text-mist-300">AI 短剧工坊</span>
        <span className="text-[9px] px-1.5 py-[2px] rounded border border-line text-mist-500 tracking-widest">
          BETA
        </span>
        {project && (
          <>
            <span className="text-ink-700">/</span>
            <span className="text-mist-400 truncate max-w-[280px]">{project.title}</span>
            {dirty && <span className="text-[10px] text-amber-brand/80">保存中…</span>}
          </>
        )}
      </div>
    </header>
  )
}
