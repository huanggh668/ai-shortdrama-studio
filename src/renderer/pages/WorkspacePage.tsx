import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Clapperboard,
  Download,
  LayoutDashboard,
  Loader2,
  Pencil,
  Play,
  Square
} from 'lucide-react'
import type { Project } from '@shared/types'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/format'
import OverviewTab from '@/pages/tabs/OverviewTab'
import StoryTab from '@/pages/tabs/StoryTab'
import StoryboardTab from '@/pages/tabs/StoryboardTab'
import PreviewTab from '@/pages/tabs/PreviewTab'
import ExportTab from '@/pages/tabs/ExportTab'

const TABS = [
  { key: 'overview', label: '概览', icon: LayoutDashboard },
  { key: 'story', label: '剧本角色', icon: BookOpen },
  { key: 'storyboard', label: '分镜', icon: Clapperboard },
  { key: 'preview', label: '预览', icon: Play },
  { key: 'export', label: '导出', icon: Download }
] as const

type TabKey = (typeof TABS)[number]['key']

export default function WorkspacePage(): JSX.Element {
  const { id, tab } = useParams()
  const navigate = useNavigate()
  const project = useAppStore((state) => state.project)
  const openProject = useAppStore((state) => state.openProject)
  const closeProject = useAppStore((state) => state.closeProject)
  const runPipeline = useAppStore((state) => state.runPipeline)
  const cancelPipeline = useAppStore((state) => state.cancelPipeline)
  const tasks = useAppStore((state) => state.tasks)
  const mutate = useAppStore((state) => state.mutate)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  useEffect(() => {
    if (id) void openProject(id)
  }, [id, openProject])

  const activeTab: TabKey = (TABS.some((item) => item.key === tab) ? tab : 'overview') as TabKey
  const running = tasks.some(
    (task) => task.projectId === id && (task.status === 'running' || task.status === 'queued')
  )

  if (!project || project.id !== id) {
    return (
      <div className="flex-1 grid place-items-center text-mist-500 text-[13px] gap-3">
        <Loader2 size={20} className="spin text-amber-brand" />
        正在打开项目
      </div>
    )
  }

  const shots = project.episodes.flatMap((episode) => episode.shots)

  const goBack = async (): Promise<void> => {
    await closeProject()
    navigate('/')
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 border-b border-line-soft bg-ink-950/35 backdrop-blur px-6 pt-4">
        <div className="max-w-[1280px] mx-auto">
          <div className="flex items-start gap-3">
            <button
              className="btn btn-ghost h-8 w-8 p-0 mt-0.5"
              onClick={() => void goBack()}
              title="返回项目库"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {editingTitle ? (
                  <input
                    autoFocus
                    className="input h-8 py-0 text-[20px] font-semibold max-w-[520px]"
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={() => {
                      if (titleDraft.trim()) {
                        const next = titleDraft.trim()
                        mutate((draft) => {
                          draft.title = next
                        })
                      }
                      setEditingTitle(false)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') setEditingTitle(false)
                    }}
                  />
                ) : (
                  <>
                    <h1 className="text-[21px] font-semibold tracking-tight truncate">
                      {project.title}
                    </h1>
                    <button
                      className="text-mist-500 hover:text-mist-300"
                      onClick={() => {
                        setTitleDraft(project.title)
                        setEditingTitle(true)
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  </>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className="badge badge-amber">{project.genre}</span>
                <span className="badge">{project.style}</span>
                <span className="badge">{project.aspect === '9:16' ? '竖屏 9:16' : '横屏 16:9'}</span>
                <span className="badge badge-violet">{project.episodes.length || project.episodesCount} 集</span>
                <span className="badge">{shots.length} 镜头</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
              {running ? (
                <button className="btn" onClick={() => void cancelPipeline()}>
                  <Square size={13} />
                  取消生成
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => void runPipeline()}
                  disabled={running}
                >
                  <Play size={14} />
                  一键生成
                </button>
              )}
            </div>
          </div>

          <nav className="mt-4 flex items-center gap-1">
            {TABS.map((item) => {
              const Icon = item.icon
              const active = activeTab === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(`/project/${project.id}/${item.key}`)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-3.5 h-9 text-[12.5px] rounded-t-lg transition-colors',
                    active
                      ? 'text-amber-brand bg-ink-850'
                      : 'text-mist-500 hover:text-mist-300 hover:bg-ink-850/50'
                  )}
                >
                  <Icon size={14} />
                  {item.label}
                  {active && (
                    <span className="absolute left-3 right-3 -bottom-px h-[2px] rounded bg-amber-brand" />
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-[1280px] mx-auto px-6 py-6">
          {activeTab === 'overview' && <OverviewTab project={project} running={running} />}
          {activeTab === 'story' && <StoryTab project={project} running={running} />}
          {activeTab === 'storyboard' && <StoryboardTab project={project} running={running} />}
          {activeTab === 'preview' && <PreviewTab project={project} />}
          {activeTab === 'export' && <ExportTab project={project} running={running} />}
        </div>
      </div>
    </div>
  )
}
