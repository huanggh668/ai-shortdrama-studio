import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clapperboard,
  Copy,
  Film,
  FolderOpen,
  Plus,
  Sparkles,
  Trash2
} from 'lucide-react'
import { SAMPLE_PROJECT } from '@shared/constants'
import { api, assetUrl } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useAppStore } from '@/stores/appStore'
import NewProjectDialog from '@/components/NewProjectDialog'

export default function ProjectsPage(): JSX.Element {
  const navigate = useNavigate()
  const projects = useAppStore((state) => state.projects)
  const refreshProjects = useAppStore((state) => state.refreshProjects)
  const createProject = useAppStore((state) => state.createProject)
  const notify = useAppStore((state) => state.notify)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    void refreshProjects()
  }, [refreshProjects])

  const startSample = async (): Promise<void> => {
    try {
      const project = await createProject({
        idea: SAMPLE_PROJECT.idea,
        title: SAMPLE_PROJECT.title,
        genre: SAMPLE_PROJECT.genre,
        style: SAMPLE_PROJECT.style,
        aspect: '9:16',
        episodesCount: 1,
        episodeDuration: 45,
        subtitle: true,
        titleCard: true
      })
      navigate(`/project/${project.id}/overview`)
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error))
    }
  }

  const duplicate = async (id: string): Promise<void> => {
    setBusyId(id)
    try {
      await api.projects.duplicate(id)
      await refreshProjects()
      notify('success', '已创建副本')
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string, title: string): Promise<void> => {
    if (!window.confirm(`删除项目「${title}」？项目文件会从本机永久删除。`)) return
    setBusyId(id)
    try {
      await api.projects.remove(id)
      await refreshProjects()
      notify('success', '项目已删除')
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1240px] mx-auto px-8 py-8">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-[11px] tracking-[0.28em] text-mist-500">PROJECTS</div>
            <h1 className="mt-2 text-[28px] font-semibold tracking-tight">项目库</h1>
            <p className="mt-1.5 text-[13px] text-mist-500">
              一句话起步，流水线完成剧本、分镜、画面、配音与成片。
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setDialogOpen(true)}>
            <Plus size={15} />
            新建项目
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="mt-8 panel relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(600px_300px_at_80%_0%,rgba(124,92,255,0.22),transparent_65%),radial-gradient(500px_260px_at_10%_100%,rgba(245,165,36,0.14),transparent_65%)]" />
            <div className="relative px-10 py-14 max-w-2xl">
              <span className="badge badge-amber">
                <Sparkles size={11} /> 开箱即用 · 无需 API Key
              </span>
              <h2 className="mt-5 text-[26px] leading-snug font-semibold">
                先看一部片，
                <br />
                再决定是否接入模型。
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-mist-500">
                演示模式会用本地模板生成剧本、关键帧与运镜，完整跑通到 MP4。准备好后，在设置里填入
                DeepSeek / 可灵 / ComfyUI 等供应商即可切换为真实生成。
              </p>
              <div className="mt-7 flex gap-3">
                <button className="btn btn-primary" onClick={() => void startSample()}>
                  <Film size={15} />
                  用示例创意开一部
                </button>
                <button className="btn" onClick={() => setDialogOpen(true)}>
                  <Plus size={15} />
                  自己写一句话
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-4">
            <button
              className="group rounded-2xl border border-dashed border-line hover:border-amber-brand/50 bg-ink-850/40 min-h-[248px] flex flex-col items-center justify-center gap-3 text-mist-500 hover:text-amber-brand transition-colors"
              onClick={() => setDialogOpen(true)}
            >
              <span className="h-11 w-11 rounded-full border border-line group-hover:border-amber-brand/40 grid place-items-center">
                <Plus size={18} />
              </span>
              <span className="text-[12.5px]">新建短剧项目</span>
            </button>

            {projects.map((project) => (
              <div
                key={project.id}
                className="panel group overflow-hidden cursor-pointer hover:border-line/80 transition-colors"
                onClick={() => navigate(`/project/${project.id}/overview`)}
              >
                <div className="relative aspect-[16/10] bg-ink-800 overflow-hidden">
                  {project.coverPath ? (
                    <img
                      src={assetUrl(project.id, project.coverPath)}
                      alt={project.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="h-full w-full bg-[radial-gradient(300px_180px_at_70%_10%,rgba(124,92,255,0.28),transparent_70%),linear-gradient(150deg,#151b28,#0b0e14)] grid place-items-center">
                      <Clapperboard size={30} className="text-mist-500/60" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-transparent" />
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    <span className="badge badge-violet">{project.aspect === '9:16' ? '竖屏' : '横屏'}</span>
                    <span className="badge">{project.genre}</span>
                  </div>
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="h-7 w-7 rounded-lg bg-ink-950/80 border border-line grid place-items-center text-mist-400 hover:text-amber-brand"
                      title="复制项目"
                      onClick={(event) => {
                        event.stopPropagation()
                        void duplicate(project.id)
                      }}
                      disabled={busyId === project.id}
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      className="h-7 w-7 rounded-lg bg-ink-950/80 border border-line grid place-items-center text-mist-400 hover:text-red-400"
                      title="删除项目"
                      onClick={(event) => {
                        event.stopPropagation()
                        void remove(project.id, project.title)
                      }}
                      disabled={busyId === project.id}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-mist-300 truncate">
                      {project.title}
                    </h3>
                    <FolderOpen size={14} className="text-mist-500 shrink-0 mt-0.5" />
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-500 line-clamp-2 min-h-[34px]">
                    {project.idea}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-[10.5px] text-mist-500">
                    <span>{project.episodeCount} 集</span>
                    <span>·</span>
                    <span>{project.shotCount} 镜头</span>
                    <span className="ml-auto">{formatDate(project.updatedAt)}</span>
                  </div>
                  <div className="progress-track mt-2.5">
                    <div className="progress-bar" style={{ width: `${project.progress}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 flex items-center gap-6 text-[11px] text-mist-500/70">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" /> 本地存储
          </span>
          <span>项目数据位于用户数据目录，可整包迁移</span>
        </div>
      </div>

      <NewProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
