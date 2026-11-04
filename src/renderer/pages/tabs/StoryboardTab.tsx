import { useState } from 'react'
import type { JSX } from 'react'
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  Clapperboard,
  Film,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload
} from 'lucide-react'
import type { Project, Shot } from '@shared/types'
import { CAMERA_MOVES, SHOT_SIZES } from '@shared/constants'
import { api, assetUrl } from '@/lib/api'
import { assetLabel, assetTone, cn, errorText, formatDuration } from '@/lib/format'
import { useAppStore } from '@/stores/appStore'

export default function StoryboardTab({
  project,
  running
}: {
  project: Project
  running: boolean
}): JSX.Element {
  const updateShot = useAppStore((state) => state.updateShot)
  const addShot = useAppStore((state) => state.addShot)
  const deleteShot = useAppStore((state) => state.deleteShot)
  const moveShot = useAppStore((state) => state.moveShot)
  const regenerateShot = useAppStore((state) => state.regenerateShot)
  const runPipeline = useAppStore((state) => state.runPipeline)
  const notify = useAppStore((state) => state.notify)
  const saveNow = useAppStore((state) => state.saveNow)
  const openProject = useAppStore((state) => state.openProject)
  const [episodeId, setEpisodeId] = useState('')
  const [shotId, setShotId] = useState('')
  const [busy, setBusy] = useState('')

  const episodes = project.episodes
  const currentEpisode = episodes.find((episode) => episode.id === episodeId) ?? episodes[0]
  const shots = currentEpisode?.shots ?? []
  const shot = shots.find((item) => item.id === shotId) ?? shots[0]

  const selectEpisode = (id: string): void => {
    setEpisodeId(id)
    const episode = episodes.find((item) => item.id === id)
    setShotId(episode?.shots[0]?.id ?? '')
  }

  const patch = (value: Partial<Shot>): void => {
    if (!shot) return
    updateShot(shot.id, value)
  }

  const regenerate = async (kind: 'image' | 'audio' | 'video'): Promise<void> => {
    if (!shot) return
    setBusy(kind)
    try {
      await saveNow()
      await regenerateShot(shot.id, kind)
    } finally {
      setBusy('')
    }
  }

  const importAsset = async (kind: 'image' | 'audio' | 'video'): Promise<void> => {
    if (!shot) return
    setBusy(`import-${kind}`)
    try {
      const source = await api.assets.pickLocalFile(kind)
      if (!source) return
      await saveNow()
      if (kind === 'image') await api.assets.importImage(project.id, shot.id, source)
      else if (kind === 'audio') await api.assets.importAudio(project.id, shot.id, source)
      else await api.assets.importVideo(project.id, shot.id, source)
      await openProject(project.id)
      notify('success', '素材已导入')
    } catch (error) {
      notify('error', errorText(error))
    } finally {
      setBusy('')
    }
  }

  if (episodes.length === 0) {
    return (
      <div className="panel px-10 py-16 text-center fade-in">
        <Clapperboard size={30} className="mx-auto text-mist-500/60" />
        <h2 className="mt-4 text-[16px] font-medium text-mist-300">还没有分镜</h2>
        <p className="mt-2 text-[12px] text-mist-500">先生成大纲，再把每集拆成可生成的镜头。</p>
        <button
          className="btn btn-primary mt-6"
          disabled={running}
          onClick={() => void runPipeline({ from: 'storyboard', force: true })}
        >
          {running ? <Loader2 size={14} className="spin" /> : <Clapperboard size={14} />}
          生成分镜脚本
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[352px_1fr] gap-4 items-start fade-in">
      <div className="panel p-4">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {episodes.map((episode) => (
            <button
              key={episode.id}
              onClick={() => selectEpisode(episode.id)}
              className={cn(
                'shrink-0 px-2.5 h-7 rounded-lg text-[11px] border transition-colors',
                currentEpisode?.id === episode.id
                  ? 'border-amber-brand/60 bg-amber-brand/10 text-amber-brand'
                  : 'border-line text-mist-500 hover:text-mist-300'
              )}
            >
              EP{String(episode.index).padStart(2, '0')}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-[12px] text-mist-400 truncate">{currentEpisode?.title}</div>
          <span className="text-[10.5px] text-mist-500">{shots.length} 镜</span>
        </div>

        <div className="mt-3 space-y-2 max-h-[calc(100vh-290px)] overflow-auto pr-1">
          {shots.map((item) => (
            <button
              key={item.id}
              onClick={() => setShotId(item.id)}
              className={cn(
                'w-full text-left rounded-xl border p-2.5 flex gap-2.5 transition-colors',
                shot?.id === item.id
                  ? 'border-amber-brand/55 bg-amber-brand/[0.06]'
                  : 'border-line-soft bg-ink-900/60 hover:border-line'
              )}
            >
              <div className="w-[54px] h-[80px] shrink-0 rounded-md overflow-hidden bg-ink-800 border border-line/60">
                {item.image.path ? (
                  <img
                    src={assetUrl(project.id, item.image.path)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-mist-500/40">
                    <ImageIcon size={16} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] mono text-amber-brand/90">
                    #{String(item.no).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-mist-500">{item.shotSize}</span>
                  <span className="ml-auto text-[10px] text-mist-500 mono">
                    {formatDuration(item.duration)}
                  </span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-mist-300 truncate">{item.scene}</div>
                <div className="mt-0.5 text-[10.5px] text-mist-500 line-clamp-2 min-h-[28px]">
                  {item.dialogue || item.action || '—'}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <AssetDot label="图" status={item.image.status} />
                  <AssetDot label="音" status={item.audio.status} />
                  <AssetDot label="影" status={item.video.status} />
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          className="btn btn-sm w-full mt-3"
          disabled={!currentEpisode || running}
          onClick={() => currentEpisode && addShot(currentEpisode.id)}
        >
          <Plus size={12} />
          添加镜头
        </button>
      </div>

      {shot ? (
        <div className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] mono text-amber-brand">
                  SHOT {String(shot.no).padStart(2, '0')}
                </span>
                <span className={cn('badge', assetTone(shot.image.status))}>
                  画面 {assetLabel(shot.image.status)}
                </span>
                <span className={cn('badge', assetTone(shot.video.status))}>
                  视频 {assetLabel(shot.video.status)}
                </span>
                <span className={cn('badge', assetTone(shot.audio.status))}>
                  配音 {assetLabel(shot.audio.status)}
                </span>
              </div>
              <h2 className="mt-2 text-[16px] font-medium text-mist-300">
                {shot.scene} · {shot.shotSize} · {shot.cameraMove}
              </h2>
            </div>
            <div className="flex gap-1">
              <button
                className="btn btn-sm btn-ghost"
                title="上移"
                disabled={running}
                onClick={() => moveShot(shot.id, -1)}
              >
                <ArrowUp size={13} />
              </button>
              <button
                className="btn btn-sm btn-ghost"
                title="下移"
                disabled={running}
                onClick={() => moveShot(shot.id, 1)}
              >
                <ArrowDown size={13} />
              </button>
              <button
                className="btn btn-sm btn-ghost text-red-300/80 hover:text-red-300"
                title="删除镜头"
                disabled={running}
                onClick={() => {
                  if (window.confirm(`删除镜头 #${shot.no}？`)) deleteShot(shot.id)
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="panel-soft p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-mist-400 flex items-center gap-1">
                  <ImageIcon size={12} /> 关键帧
                </span>
                <span className={cn('badge', assetTone(shot.image.status))}>
                  {assetLabel(shot.image.status)}
                </span>
              </div>
              <div className="aspect-[9/16] rounded-lg overflow-hidden bg-ink-900 border border-line/60">
                {shot.image.path ? (
                  <img
                    src={assetUrl(project.id, shot.image.path)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-mist-500/40">
                    <ImageIcon size={22} />
                  </div>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  className="btn btn-sm"
                  disabled={running || busy !== ''}
                  onClick={() => void regenerate('image')}
                >
                  {busy === 'image' ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}
                  重生成
                </button>
                <button
                  className="btn btn-sm"
                  disabled={running || busy !== ''}
                  onClick={() => void importAsset('image')}
                >
                  <Upload size={11} />
                  导入
                </button>
              </div>
              {shot.image.error && (
                <div className="mt-1.5 text-[10px] text-red-300/80 line-clamp-2">
                  {shot.image.error}
                </div>
              )}
            </div>

            <div className="panel-soft p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-mist-400 flex items-center gap-1">
                  <AudioLines size={12} /> 配音
                </span>
                <span className="text-[10px] text-mist-500 mono">
                  {shot.audio.duration ? formatDuration(shot.audio.duration) : '—'}
                </span>
              </div>
              <div className="aspect-[9/16] rounded-lg bg-ink-900 border border-line/60 flex items-center justify-center p-3">
                {shot.audio.path ? (
                  <audio
                    controls
                    preload="metadata"
                    src={assetUrl(project.id, shot.audio.path)}
                    className="w-full"
                  />
                ) : (
                  <div className="text-center text-mist-500/60">
                    <AudioLines size={22} className="mx-auto" />
                    <div className="mt-2 text-[10.5px]">
                      {shot.audio.status === 'skipped' ? '静音模式' : '尚未生成'}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  className="btn btn-sm"
                  disabled={running || busy !== '' || !(shot.dialogue || shot.narration)}
                  onClick={() => void regenerate('audio')}
                >
                  {busy === 'audio' ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}
                  重生成
                </button>
                <button
                  className="btn btn-sm"
                  disabled={running || busy !== ''}
                  onClick={() => void importAsset('audio')}
                >
                  <Upload size={11} />
                  导入
                </button>
              </div>
            </div>

            <div className="panel-soft p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-mist-400 flex items-center gap-1">
                  <Film size={12} /> 视频片段
                </span>
                <span className={cn('badge', assetTone(shot.video.status))}>
                  {assetLabel(shot.video.status)}
                </span>
              </div>
              <div className="aspect-[9/16] rounded-lg overflow-hidden bg-ink-900 border border-line/60">
                {shot.video.path ? (
                  <video
                    controls
                    preload="metadata"
                    src={assetUrl(project.id, shot.video.path)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-mist-500/40">
                    <Film size={22} />
                  </div>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  className="btn btn-sm"
                  disabled={running || busy !== '' || shot.image.status !== 'done'}
                  onClick={() => void regenerate('video')}
                >
                  {busy === 'video' ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}
                  重生成
                </button>
                <button
                  className="btn btn-sm"
                  disabled={running || busy !== ''}
                  onClick={() => void importAsset('video')}
                >
                  <Upload size={11} />
                  导入
                </button>
              </div>
              {shot.video.error && (
                <div className="mt-1.5 text-[10px] text-red-300/80 line-clamp-2">
                  {shot.video.error}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div>
              <label className="label">场景</label>
              <input
                className="input"
                value={shot.scene}
                onChange={(event) => patch({ scene: event.target.value })}
              />
            </div>
            <div>
              <label className="label">景别</label>
              <select
                className="select"
                value={shot.shotSize}
                onChange={(event) => patch({ shotSize: event.target.value })}
              >
                {SHOT_SIZES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">运镜</label>
              <select
                className="select"
                value={shot.cameraMove}
                onChange={(event) => patch({ cameraMove: event.target.value })}
              >
                {CAMERA_MOVES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[110px_1fr] gap-3">
            <div>
              <label className="label">时长（秒）</label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="12"
                className="input"
                value={shot.duration}
                onChange={(event) => patch({ duration: Number(event.target.value) || 1 })}
              />
            </div>
            <div>
              <label className="label">画面动作</label>
              <textarea
                className="textarea"
                rows={2}
                value={shot.action}
                onChange={(event) => patch({ action: event.target.value })}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">台词</label>
              <textarea
                className="textarea"
                rows={2}
                placeholder="角色说的话，留空则无配音"
                value={shot.dialogue}
                onChange={(event) => patch({ dialogue: event.target.value })}
              />
            </div>
            <div>
              <label className="label">旁白</label>
              <textarea
                className="textarea"
                rows={2}
                value={shot.narration}
                onChange={(event) => patch({ narration: event.target.value })}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="label">
              画面提示词 <span className="normal-case tracking-normal text-mist-500/70">（自动附加风格与角色锚点）</span>
            </label>
            <textarea
              className="textarea"
              rows={3}
              value={shot.imagePrompt}
              onChange={(event) => patch({ imagePrompt: event.target.value })}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">视频动作提示词</label>
              <textarea
                className="textarea"
                rows={2}
                value={shot.videoPrompt}
                onChange={(event) => patch({ videoPrompt: event.target.value })}
              />
            </div>
            <div>
              <label className="label">负面提示词</label>
              <textarea
                className="textarea"
                rows={2}
                value={shot.negativePrompt}
                onChange={(event) => patch({ negativePrompt: event.target.value })}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="panel px-10 py-16 text-center text-mist-500 text-[12px]">
          左侧选择一个镜头开始编辑
        </div>
      )}
    </div>
  )
}

function AssetDot({ label, status }: { label: string; status: Shot['image']['status'] }): JSX.Element {
  const color =
    status === 'done'
      ? 'bg-emerald-400'
      : status === 'failed'
        ? 'bg-red-400'
        : status === 'running'
          ? 'bg-amber-brand'
          : status === 'stale'
            ? 'bg-violet-400'
            : 'bg-mist-500/40'
  return (
    <span className="flex items-center gap-1 text-[9.5px] text-mist-500">
      <span className={cn('h-1.5 w-1.5 rounded-full', color)} />
      {label}
    </span>
  )
}
