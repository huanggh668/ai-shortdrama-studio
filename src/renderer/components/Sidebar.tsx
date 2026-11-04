import type { JSX } from 'react'
import { FolderKanban, Settings2, Wand2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/format'

const ITEMS = [
  { key: 'projects', label: '项目', icon: FolderKanban, path: '/' },
  { key: 'settings', label: '设置', icon: Settings2, path: '/settings' }
]

export default function Sidebar(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const isProject = location.pathname.startsWith('/project')
  const isSettings = location.pathname.startsWith('/settings')

  return (
    <aside className="no-drag w-[76px] shrink-0 border-r border-line-soft bg-ink-950/45 flex flex-col items-center py-4 gap-2">
      <button
        onClick={() => navigate('/')}
        className="mb-4 h-10 w-10 rounded-xl bg-gradient-to-br from-violet-brand/80 to-violet-700/70 border border-violet-400/20 grid place-items-center text-white shadow-[0_8px_24px_rgba(124,92,255,0.25)]"
        title="AI 短剧工坊"
      >
        <Wand2 size={18} />
      </button>
      {ITEMS.map((item) => {
        const active = item.key === 'projects' ? isProject || location.pathname === '/' : isSettings
        const Icon = item.icon
        return (
          <button
            key={item.key}
            onClick={() => navigate(item.path)}
            className={cn(
              'relative w-[58px] py-2.5 rounded-xl flex flex-col items-center gap-1 text-[10px] transition-colors',
              active
                ? 'bg-ink-800 text-amber-brand'
                : 'text-mist-500 hover:text-mist-300 hover:bg-ink-850'
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r bg-amber-brand" />
            )}
            <Icon size={18} />
            {item.label}
          </button>
        )
      })}
      <div className="mt-auto text-[9px] text-mist-500/60 tracking-widest">LOCAL</div>
    </aside>
  )
}
