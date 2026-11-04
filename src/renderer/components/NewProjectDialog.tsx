import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Sparkles } from 'lucide-react'
import { GENRES, SAMPLE_PROJECT, STYLE_PRESETS } from '@shared/constants'
import type { AspectRatio } from '@shared/types'
import Modal from '@/components/Modal'
import { useAppStore } from '@/stores/appStore'
import { errorText } from '@/lib/format'

interface Props {
  open: boolean
  onClose: () => void
  preset?: { title?: string; idea?: string; genre?: string; style?: string }
}

interface FormState {
  title: string
  idea: string
  genre: string
  style: string
  aspect: AspectRatio
  episodesCount: number
  episodeDuration: number
  subtitle: boolean
  titleCard: boolean
}

const INITIAL: FormState = {
  title: '',
  idea: '',
  genre: '都市逆袭',
  style: '电影感写实',
  aspect: '9:16',
  episodesCount: 1,
  episodeDuration: 60,
  subtitle: true,
  titleCard: true
}

export default function NewProjectDialog({ open, onClose, preset }: Props): JSX.Element {
  const navigate = useNavigate()
  const createProject = useAppStore((state) => state.createProject)
  const notify = useAppStore((state) => state.notify)
  const [form, setForm] = useState<FormState>(INITIAL)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      ...INITIAL,
      ...(preset?.title ? { title: preset.title } : {}),
      ...(preset?.idea ? { idea: preset.idea } : {}),
      ...(preset?.genre ? { genre: preset.genre } : {}),
      ...(preset?.style ? { style: preset.style } : {})
    })
  }, [open, preset])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  const submit = async (): Promise<void> => {
    if (!form.idea.trim()) {
      notify('error', '先写一句话创意，哪怕只有一句')
      return
    }
    setSaving(true)
    try {
      const project = await createProject({
        title: form.title.trim() || undefined,
        idea: form.idea.trim(),
        genre: form.genre,
        style: form.style,
        aspect: form.aspect,
        episodesCount: form.episodesCount,
        episodeDuration: form.episodeDuration,
        subtitle: form.subtitle,
        titleCard: form.titleCard
      })
      onClose()
      navigate(`/project/${project.id}/overview`)
      notify('success', '项目已创建，点「一键生成」开始')
    } catch (error) {
      notify('error', `创建失败：${errorText(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="新建短剧项目"
      description="一句话或一段梗概就够，其余交给流水线。"
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            创建项目
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">一句话创意 *</label>
          <textarea
            className="textarea"
            rows={4}
            placeholder="例如：被公司恶意裁员的女孩，三年后以投资人身份回到会议室，当众揭穿当年构陷她的上司。"
            value={form.idea}
            onChange={(event) => update('idea', event.target.value)}
          />
          <div className="mt-1.5 flex justify-between">
            <span className="hint">越具体越好：人物 + 冲突 + 反转。</span>
            <button
              className="text-[11px] text-amber-brand/90 hover:text-amber-brand"
              onClick={() =>
                setForm((previous) => ({ ...previous, ...SAMPLE_PROJECT }))
              }
            >
              填入示例创意
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">项目标题（可选）</label>
            <input
              className="input"
              placeholder="留空则自动从创意截取"
              value={form.title}
              onChange={(event) => update('title', event.target.value)}
            />
          </div>
          <div>
            <label className="label">题材</label>
            <select
              className="select"
              value={form.genre}
              onChange={(event) => update('genre', event.target.value)}
            >
              {GENRES.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">视觉风格</label>
            <select
              className="select"
              value={form.style}
              onChange={(event) => update('style', event.target.value)}
            >
              {STYLE_PRESETS.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">画幅</label>
            <div className="flex gap-2">
              {(['9:16', '16:9'] as AspectRatio[]).map((aspect) => (
                <button
                  key={aspect}
                  onClick={() => update('aspect', aspect)}
                  className={`flex-1 h-[42px] rounded-[10px] border text-[12px] transition-colors ${
                    form.aspect === aspect
                      ? 'border-amber-brand/70 bg-amber-brand/10 text-amber-brand'
                      : 'border-line bg-ink-900 text-mist-400 hover:border-line/80'
                  }`}
                >
                  {aspect === '9:16' ? '竖屏 9:16' : '横屏 16:9'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">集数</label>
            <select
              className="select"
              value={form.episodesCount}
              onChange={(event) => update('episodesCount', Number(event.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>
                  {count} 集
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">单集时长</label>
            <select
              className="select"
              value={form.episodeDuration}
              onChange={(event) => update('episodeDuration', Number(event.target.value))}
            >
              {[30, 45, 60, 90, 120].map((duration) => (
                <option key={duration} value={duration}>
                  {duration} 秒
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-6 pt-1">
          <label className="flex items-center gap-2 text-[12px] text-mist-400 cursor-pointer">
            <input
              type="checkbox"
              className="accent-amber-brand"
              checked={form.subtitle}
              onChange={(event) => update('subtitle', event.target.checked)}
            />
            生成字幕
          </label>
          <label className="flex items-center gap-2 text-[12px] text-mist-400 cursor-pointer">
            <input
              type="checkbox"
              className="accent-amber-brand"
              checked={form.titleCard}
              onChange={(event) => update('titleCard', event.target.checked)}
            />
            片头 / 片尾卡
          </label>
          <span className="ml-auto text-[11px] text-mist-500">
            创建后可随时在分镜里改提示词、重生成单个镜头
          </span>
        </div>
      </div>
    </Modal>
  )
}
