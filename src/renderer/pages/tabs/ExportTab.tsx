import { useState } from 'react'
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Download,
  FolderOpen,
  Layers,
  Loader2,
  Music2,
  Package,
  Settings2,
  Sparkles,
  X
} from 'lucide-react'
import type { Project } from '@shared/types'
import { api } from '@/lib/api'
import { cn, errorText } from '@/lib/format'
import { useAppStore } from '@/stores/appStore'

export default function ExportTab({
  project,
  running
}: {
  project: Project
  running: boolean
}): JSX.Element {
  const navigate = useNavigate()
  const settings = useAppStore((state) => state.settings)
  const mutate = useAppStore((state) => state.mutate)
  const notify = useAppStore((state) => state.notify)
  const saveNow = useAppStore((state) => state.saveNow)
  const runPipeline = useAppStore((state) => state.runPipeline)
  const [busy, setBusy] = useState('')

  const resolution = project.aspect === '9:16' ? '1080 × 1920' : '1920 × 1080'
  const fps = settings?.media.fps ?? 30
  const burn = settings?.media.burnSubtitles ?? true
  const bgmName = project.bgmPath?.split(/[\\/]/).pop()

  const withBusy = async (key: string, task: () => Promise<void>): Promise<void> => {
    setBusy(key)
    try {
      await task()
    } catch (error) {
      notify('error', errorText(error))
    } finally {
      setBusy('')
    }
  }

  const pickBgm = async (): Promise<void> => {
    const path = await api.assets.pickBgm()
    if (path) {
      mutate((draft) => {
        draft.bgmPath = path
      })
      notify('success', '背景音乐已设置，合成时自动混音')
    }
  }

  const generate = (): Promise<void> =>
    withBusy('render', async () => {
      await saveNow()
      await runPipeline({ from: 'videos' })
      notify('info', '已开始生成成片，进度见右下角')
    })

  const merge = (): Promise<void> =>
    withBusy('merge', async () => {
      await saveNow()
      const output = await api.projects.mergeSeries(project.id)
      notify('success', `全剧已合并：${output.split(/[\\/]/).pop()}`)
    })

  const bundle = (): Promise<void> =>
    withBusy('bundle', async () => {
      await saveNow()
      await api.projects.exportBundle(project.id)
      notify('success', '工程包已导出')
    })

  return (
    <div className="space-y-4 fade-in">
      <div className="grid grid-cols-[1.25fr_0.75fr] gap-4">
        <div className="panel p-5">
          <div className="section-title">成片输出</div>
          <p className="mt-1 text-[11.5px] text-mist-500">
            按集导出 H.264 / AAC 的 MP4，可直接发布到抖音、快手、视频号。
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <Info label="分辨率" value={resolution} />
            <Info label="帧率" value={`${fps} fps`} />
            <Info label="字幕" value={burn ? '烧录进画面' : '外挂 SRT'} />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="btn btn-primary"
              disabled={running || busy !== ''}
              onClick={() => void generate()}
            >
              {busy === 'render' || running ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Sparkles size={14} />
              )}
              生成成片
            </button>
            <button
              className="btn"
              disabled={running || busy !== ''}
              onClick={() => void merge()}
            >
              {busy === 'merge' ? <Loader2 size={14} className="spin" /> : <Layers size={14} />}
              合并全剧
            </button>
            <button
              className="btn"
              disabled={running || busy !== ''}
              onClick={() => void bundle()}
            >
              {busy === 'bundle' ? <Loader2 size={14} className="spin" /> : <Package size={14} />}
              导出工程包
            </button>
            <button
              className="btn btn-ghost ml-auto"
              onClick={() => void api.projects.openFolder(project.id).catch((error) => notify('error', errorText(error)))}
            >
              <FolderOpen size={14} />
              项目目录
            </button>
          </div>

          {project.seriesExportPath && (
            <div className="mt-3 panel-soft px-3 py-2 flex items-center gap-2 text-[11.5px]">
              <Layers size={13} className="text-violet-300" />
              <span className="text-mist-400">全剧合并版</span>
              <span className="text-mist-500 truncate flex-1">
                {project.seriesExportPath.split(/[\\/]/).pop()}
              </span>
              <button
                className="text-amber-brand/90 hover:text-amber-brand"
                onClick={() =>
                  void api.projects
                    .revealFile(project.id, project.seriesExportPath!)
                    .catch((error) => notify('error', errorText(error)))
                }
              >
                定位
              </button>
            </div>
          )}
        </div>

        <div className="panel p-5">
          <div className="section-title">画面设置</div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] text-mist-300">字幕</div>
                <div className="text-[10.5px] text-mist-500">随片生成并烧录</div>
              </div>
              <Toggle
                checked={project.subtitle}
                onChange={(value) =>
                  mutate((draft) => {
                    draft.subtitle = value
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] text-mist-300">片头 / 片尾卡</div>
                <div className="text-[10.5px] text-mist-500">每集前后各加 2 秒</div>
              </div>
              <Toggle
                checked={project.titleCard}
                onChange={(value) =>
                  mutate((draft) => {
                    draft.titleCard = value
                  })
                }
              />
            </div>
            <div className="divider" />
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-mist-300 flex items-center gap-1.5">
                  <Music2 size={13} /> 背景音乐
                </div>
                <button className="btn btn-sm" onClick={() => void pickBgm()}>
                  选择
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="text-mist-500 truncate flex-1">
                  {bgmName || '未选择（可在合成时自动混音）'}
                </span>
                {project.bgmPath && (
                  <button
                    className="text-mist-500 hover:text-red-300"
                    onClick={() =>
                      mutate((draft) => {
                        delete draft.bgmPath
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
            <button
              className="btn btn-sm w-full"
              onClick={() => navigate('/settings')}
            >
              <Settings2 size={12} />
              更多输出设置
            </button>
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between">
          <div className="section-title">分集成片</div>
          <span className="text-[10.5px] text-mist-500">
            {project.episodes.filter((episode) => project.exports?.[episode.id]).length}/
            {project.episodes.length} 已导出
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {project.episodes.map((episode) => {
            const output = project.exports?.[episode.id]
            return (
              <div
                key={episode.id}
                className="panel-soft px-4 py-3 flex items-center gap-3"
              >
                <span className="badge badge-violet mono">
                  EP{String(episode.index).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-mist-300 truncate">{episode.title}</div>
                  <div className="text-[10.5px] text-mist-500 truncate">
                    {output ? output.split(/[\\/]/).pop() : '尚未生成'}
                  </div>
                </div>
                <span className={cn('badge', output ? 'badge-green' : 'badge-gray')}>
                  {output ? '已导出' : '待生成'}
                </span>
                {output && (
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      void api.projects
                        .revealFile(project.id, output)
                        .catch((error) => notify('error', errorText(error)))
                    }
                  >
                    定位
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="panel-soft px-3 py-2.5">
      <div className="text-[10px] text-mist-500">{label}</div>
      <div className="mt-1 text-[12.5px] text-mist-300 mono">{value}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (value: boolean) => void
}): JSX.Element {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 rounded-full border transition-colors',
        checked ? 'bg-amber-brand/80 border-amber-brand' : 'bg-ink-800 border-line'
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all',
          checked ? 'left-[23px]' : 'left-[2px]'
        )}
      />
    </button>
  )
}
