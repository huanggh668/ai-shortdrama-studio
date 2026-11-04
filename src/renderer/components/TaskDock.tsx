import type { JSX } from 'react'
import { Loader2, Square } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/format'

export default function TaskDock(): JSX.Element | null {
  const tasks = useAppStore((state) => state.tasks)
  const cancel = useAppStore((state) => state.cancelPipeline)
  const active = tasks.filter((task) => task.status === 'queued' || task.status === 'running')

  if (active.length === 0) return null

  return (
    <div className="fixed bottom-5 right-6 z-40 w-[320px] space-y-2">
      {active.slice(0, 3).map((task) => (
        <div key={task.id} className="panel px-3.5 py-3 fade-in">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="text-amber-brand spin shrink-0" />
            <span className="text-[12px] text-mist-300 flex-1 truncate">{task.label}</span>
            <span className="text-[11px] text-mist-500 mono">{task.progress}%</span>
            {task.kind === 'pipeline' && (
              <button
                className="text-mist-500 hover:text-red-400"
                title="取消"
                onClick={() => void cancel()}
              >
                <Square size={12} />
              </button>
            )}
          </div>
          <div className="progress-track mt-2">
            <div
              className={cn('progress-bar', task.kind === 'regenerate' && 'progress-bar-violet')}
              style={{ width: `${task.progress}%` }}
            />
          </div>
          {task.message && (
            <div className="mt-1.5 text-[10.5px] text-mist-500 truncate">{task.message}</div>
          )}
        </div>
      ))}
    </div>
  )
}
