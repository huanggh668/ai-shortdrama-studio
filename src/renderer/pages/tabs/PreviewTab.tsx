import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Clapperboard, Film, Loader2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { Project, Shot } from '@shared/types'
import { assetUrl } from '@/lib/api'
import { cn } from '@/lib/format'
import { useAppStore } from '@/stores/appStore'

export default function PreviewTab({ project }: { project: Project }): JSX.Element {
  const runPipeline = useAppStore((state) => state.runPipeline)
  const tasks = useAppStore((state) => state.tasks)
  const [episodeId, setEpisodeId] = useState('')
  const episode = project.episodes.find((item) => item.id === episodeId) ?? project.episodes[0]
  const running = tasks.some(
    (task) => task.projectId === project.id && (task.status === 'running' || task.status === 'queued')
  )

  if (!episode) {
    return (
      <div className="panel px-10 py-16 text-center fade-in">
        <Clapperboard size={30} className="mx-auto text-mist-500/60" />
        <h2 className="mt-4 text-[16px] font-medium text-mist-300">还没有可预览的内容</h2>
        <p className="mt-2 text-[12px] text-mist-500">先一键生成，或去分镜页生成画面与视频片段。</p>
        <button
          className="btn btn-primary mt-6"
          disabled={running}
          onClick={() => void runPipeline()}
        >
          {running ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          一键生成
        </button>
      </div>
    )
  }

  const exportRel = project.exports?.[episode.id]
  const playable = episode.shots.filter(
    (shot) => shot.video.status === 'done' && shot.video.path
  )

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center gap-2">
        {project.episodes.map((item) => (
          <button
            key={item.id}
            onClick={() => setEpisodeId(item.id)}
            className={cn(
              'px-3 h-8 rounded-lg text-[11.5px] border transition-colors',
              episode.id === item.id
                ? 'border-amber-brand/55 bg-amber-brand/10 text-amber-brand'
                : 'border-line text-mist-500 hover:text-mist-300'
            )}
          >
            EP{String(item.index).padStart(2, '0')} · {item.title}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-mist-500">
          {exportRel ? '已导出成片' : playable.length > 0 ? `分镜序列 · ${playable.length} 段` : '尚未生成视频'}
        </span>
      </div>

      {exportRel ? (
        <div className="panel p-3">
          <video
            key={exportRel}
            controls
            preload="metadata"
            src={assetUrl(project.id, exportRel)}
            className={cn(
              'mx-auto bg-black rounded-xl max-h-[70vh]',
              project.aspect === '9:16' ? 'aspect-[9/16]' : 'aspect-video w-full'
            )}
          />
        </div>
      ) : playable.length > 0 ? (
        <SequencePlayer project={project} shots={episode.shots} playable={playable} />
      ) : (
        <div className="panel px-10 py-14 text-center">
          <Film size={28} className="mx-auto text-mist-500/60" />
          <div className="mt-3 text-[13px] text-mist-400">这一集还没有视频片段</div>
          <div className="mt-1 text-[11.5px] text-mist-500">
            生成关键帧后，可一键把每个镜头转成动态视频。
          </div>
          <button
            className="btn btn-primary mt-5"
            disabled={running}
            onClick={() => void runPipeline({ from: 'videos' })}
          >
            {running ? <Loader2 size={14} className="spin" /> : <Film size={14} />}
            生成视频片段
          </button>
        </div>
      )}

      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <div className="section-title">镜头条</div>
          <span className="text-[10.5px] text-mist-500">{episode.shots.length} 个镜头</span>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {episode.shots.map((shot) => (
            <div
              key={shot.id}
              className="shrink-0 w-[92px] rounded-lg overflow-hidden border border-line-soft bg-ink-900"
            >
              <div className="aspect-[9/16] bg-ink-800">
                {shot.image.path ? (
                  <img
                    src={assetUrl(project.id, shot.image.path)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-mist-500/40">
                    <Clapperboard size={15} />
                  </div>
                )}
              </div>
              <div className="px-1.5 py-1 flex items-center justify-between">
                <span className="text-[9.5px] mono text-mist-500">
                  #{String(shot.no).padStart(2, '0')}
                </span>
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    shot.video.status === 'done' ? 'bg-emerald-400' : 'bg-mist-500/40'
                  )}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SequencePlayer({
  project,
  shots,
  playable
}: {
  project: Project
  shots: Shot[]
  playable: Shot[]
}): JSX.Element {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const current = playable[Math.min(index, playable.length - 1)]
  const currentIndex = current ? shots.findIndex((shot) => shot.id === current.id) : -1

  useEffect(() => {
    if (!current) return
    const timer = setTimeout(() => {
      if (playing) void videoRef.current?.play().catch(() => undefined)
    }, 40)
    return () => clearTimeout(timer)
  }, [index, playing, current])

  const next = (): void => {
    if (index < playable.length - 1) setIndex(index + 1)
    else setPlaying(false)
  }

  return (
    <div className="panel p-3">
      <div
        className={cn(
          'relative mx-auto bg-black rounded-xl overflow-hidden',
          project.aspect === '9:16' ? 'aspect-[9/16] max-h-[64vh]' : 'aspect-video w-full'
        )}
      >
        <video
          key={current.id}
          ref={videoRef}
          src={assetUrl(project.id, current.video.path)}
          className="h-full w-full object-contain"
          playsInline
          onEnded={next}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        {(current.dialogue || current.narration) && (
          <div className="absolute inset-x-6 bottom-6 text-center">
            <span className="inline-block px-3 py-1.5 rounded-md bg-black/55 text-white text-[14px] leading-relaxed tracking-wide">
              {current.dialogue || current.narration}
            </span>
          </div>
        )}
        <div className="absolute left-3 top-3 badge badge-amber mono">
          SHOT {String(current.no).padStart(2, '0')}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          className="btn btn-sm"
          onClick={() => {
            setIndex(Math.max(0, index - 1))
            setPlaying(true)
          }}
          disabled={index === 0}
        >
          <SkipBack size={13} />
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => {
            if (playing) {
              videoRef.current?.pause()
              setPlaying(false)
            } else {
              setPlaying(true)
              void videoRef.current?.play().catch(() => undefined)
            }
          }}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
          {playing ? '暂停' : '播放'}
        </button>
        <button
          className="btn btn-sm"
          onClick={() => {
            setIndex(Math.min(playable.length - 1, index + 1))
            setPlaying(true)
          }}
          disabled={index >= playable.length - 1}
        >
          <SkipForward size={13} />
        </button>
        <span className="text-[11px] text-mist-500 mono ml-2">
          {index + 1} / {playable.length}
          {currentIndex >= 0 ? ` · 镜头 ${currentIndex + 1}` : ''}
        </span>
      </div>
    </div>
  )
}
