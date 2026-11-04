import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Film,
  ImageIcon,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
  Timer,
  Volume2
} from 'lucide-react'
import type { Project, StageKey } from '@shared/types'
import { STAGE_META, STAGE_ORDER } from '@shared/constants'
import { useAppStore } from '@/stores/appStore'
import { cn, formatMinutes, stageLabel, stageTone } from '@/lib/format'

export default function OverviewTab({
  project,
  running
}: {
  project: Project
  running: boolean
}): JSX.Element {
  const navigate = useNavigate()
  const settings = useAppStore((state) => state.settings)
  const logs = useAppStore((state) => state.logs)
  const runPipeline = useAppStore((state) => state.runPipeline)

  const shots = project.episodes.flatMap((episode) => episode.shots)
  const imageDone = shots.filter((shot) => shot.image.status === 'done').length
  const videoDone = shots.filter((shot) => shot.video.status === 'done').length
  const audioDone = shots.filter((shot) => shot.audio.status === 'done').length
  const duration = shots.reduce(
    (total, shot) => total + Math.max(shot.duration, (shot.audio.duration ?? 0) + 0.3),
    0
  )
  const doneStages = STAGE_ORDER.filter((stage) => project.stages[stage]?.status === 'done').length
  const overall = Math.round((doneStages / STAGE_ORDER.length) * 100)
  const projectLogs = logs
    .filter((entry) => !entry.projectId || entry.projectId === project.id)
    .slice(0, 6)

  const stageRun = (stage: StageKey, force = false): void => {
    void runPipeline({ from: stage, force })
  }

  return (
    <div className="space-y-5 fade-in">
      {settings?.demoMode && (
        <div className="panel px-5 py-4 flex items-start gap-3 border-amber-brand/25 bg-[linear-gradient(120deg,rgba(245,165,36,0.08),rgba(124,92,255,0.06))]">
          <Sparkles size={18} className="text-amber-brand mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[13px] font-medium text-mist-300">当前为演示模式</div>
            <div className="mt-1 text-[12px] leading-relaxed text-mist-500">
              剧本、关键帧与运镜使用本地模板生成，配音使用系统语音或静音。无需任何 API Key
              即可完整体验到成片；接入真实模型后同一套流程可直接复用。
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => navigate('/settings')}>
            <Settings2 size={13} />
            去配置
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <Stat
          icon={<Clapperboard size={15} />}
          label="镜头"
          value={`${shots.length}`}
          hint={`${project.episodes.length || project.episodesCount} 集`}
        />
        <Stat
          icon={<ImageIcon size={15} />}
          label="关键帧"
          value={`${imageDone}/${shots.length}`}
          hint={shots.length ? `${Math.round((imageDone / shots.length) * 100)}% 完成` : '等待分镜'}
        />
        <Stat
          icon={<Film size={15} />}
          label="视频片段"
          value={`${videoDone}/${shots.length}`}
          hint={`配音 ${audioDone} 条`}
        />
        <Stat
          icon={<Timer size={15} />}
          label="预计时长"
          value={duration ? formatMinutes(duration) : '—'}
          hint={`${project.aspect === '9:16' ? '1080×1920' : '1920×1080'} · 30fps`}
        />
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="section-title">制作流水线</div>
            <div className="text-[11.5px] text-mist-500 mt-1">
              每个阶段都可以单独运行；修改上游内容后，下游会自动标记为待更新。
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-mist-500">总体进度</div>
            <div className="text-[22px] font-semibold text-amber-brand mono">{overall}%</div>
          </div>
        </div>
        <div className="progress-track mt-3">
          <div className="progress-bar" style={{ width: `${overall}%` }} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {STAGE_ORDER.map((stage, index) => {
            const meta = STAGE_META[stage]
            const state = project.stages[stage] ?? { status: 'idle', progress: 0 }
            const isRunning = state.status === 'running'
            return (
              <div
                key={stage}
                className={cn(
                  'panel-soft p-4 transition-colors',
                  isRunning && 'border-amber-brand/40',
                  state.status === 'failed' && 'border-red-500/30'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'h-7 w-7 rounded-lg grid place-items-center text-[11px] mono border shrink-0',
                      state.status === 'done'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : isRunning
                          ? 'border-amber-brand/40 bg-amber-brand/10 text-amber-brand'
                          : 'border-line bg-ink-900 text-mist-500'
                    )}
                  >
                    {state.status === 'done' ? (
                      <CheckCircle2 size={14} />
                    ) : isRunning ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      String(index + 1).padStart(2, '0')
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-mist-300">{meta.label}</span>
                      <span className={cn('badge', stageTone(state.status))}>
                        {stageLabel(state.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-mist-500">
                      {state.message || meta.description}
                    </div>
                    {(isRunning || state.status === 'done') && (
                      <div className="progress-track mt-2.5">
                        <div
                          className="progress-bar"
                          style={{ width: `${state.status === 'done' ? 100 : state.progress}%` }}
                        />
                      </div>
                    )}
                    {state.error && (
                      <div className="mt-2 text-[11px] text-red-300/90 flex items-start gap-1.5">
                        <AlertCircle size={12} className="mt-[1px] shrink-0" />
                        <span className="line-clamp-3">{state.error}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1.5">
                  <button
                    className="btn btn-sm"
                    disabled={running || isRunning}
                    onClick={() => stageRun(stage)}
                  >
                    <Play size={12} />
                    {state.status === 'done' ? '从这继续' : '运行此阶段'}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={running || isRunning}
                    title="强制重跑此阶段及之后所有阶段"
                    onClick={() => stageRun(stage, true)}
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <div className="panel p-5">
          <div className="section-title">创作提示</div>
          <div className="mt-3 space-y-2.5 text-[12px] leading-relaxed text-mist-400">
            <Tip icon={<Sparkles size={13} />} text="一句话里写清「人物 + 冲突 + 反转」，大纲质量会明显更高。" />
            <Tip icon={<ImageIcon size={13} />} text="角色定妆提示词会被拼进每个镜头，保持全片外观一致。" />
            <Tip icon={<Volume2 size={13} />} text="配音在视频之前生成，镜头时长会自动对齐台词长度。" />
            <Tip icon={<Film size={13} />} text="成片按集导出；导出页可以合并全剧、打包工程。" />
          </div>
          <div className="mt-4 panel-soft px-4 py-3 flex items-start gap-2.5">
            <Info size={14} className="text-violet-300 mt-0.5 shrink-0" />
            <div className="text-[11.5px] leading-relaxed text-mist-500">
              生成过程中可随时切到「分镜」修改某个镜头；单镜头重生成不会影响其他镜头。
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <div className="section-title">运行日志</div>
            <span className="text-[10px] text-mist-500 mono">{projectLogs.length} 条</span>
          </div>
          <div className="mt-3 space-y-2 max-h-[220px] overflow-auto pr-1">
            {projectLogs.length === 0 && (
              <div className="text-[11.5px] text-mist-500/70 py-6 text-center">暂无日志</div>
            )}
            {projectLogs.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <span
                  className={cn(
                    'mt-[5px] h-1.5 w-1.5 rounded-full shrink-0',
                    entry.level === 'error'
                      ? 'bg-red-400'
                      : entry.level === 'warn'
                        ? 'bg-amber-brand'
                        : 'bg-emerald-400'
                  )}
                />
                <span className="text-mist-500 flex-1 break-words">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  hint
}: {
  icon: JSX.Element
  label: string
  value: string
  hint: string
}): JSX.Element {
  return (
    <div className="panel px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] text-mist-500">
        <span className="text-mist-400">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 text-[21px] font-semibold tracking-tight mono">{value}</div>
      <div className="mt-0.5 text-[10.5px] text-mist-500">{hint}</div>
    </div>
  )
}

function Tip({ icon, text }: { icon: JSX.Element; text: string }): JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span className="text-amber-brand/80 mt-[1px] shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  )
}
