import { useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import {
  CheckCircle2,
  Cpu,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Music2,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Terminal,
  Video,
  XCircle
} from 'lucide-react'
import type { AppSettings, SystemInfo, TestResult, TestTarget } from '@shared/types'
import {
  IMAGE_PRESETS,
  SYSTEM_VOICES,
  TEXT_PRESETS,
  TTS_VOICES,
  VIDEO_PRESETS
} from '@shared/constants'
import { api } from '@/lib/api'
import { cn, errorText } from '@/lib/format'
import { useAppStore } from '@/stores/appStore'

export default function SettingsPage(): JSX.Element {
  const storeSettings = useAppStore((state) => state.settings)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const testProvider = useAppStore((state) => state.testProvider)
  const notify = useAppStore((state) => state.notify)
  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<TestTarget | null>(null)
  const [results, setResults] = useState<Partial<Record<TestTarget, TestResult>>>({})
  const [info, setInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    if (storeSettings && !dirtyRef.current) {
      setDraft(structuredClone(storeSettings))
    }
  }, [storeSettings])

  useEffect(() => {
    void api.system
      .info()
      .then(setInfo)
      .catch(() => undefined)
  }, [])

  const update = (mutator: (value: AppSettings) => void): void => {
    setDraft((previous) => {
      if (!previous) return previous
      const next = structuredClone(previous)
      mutator(next)
      return next
    })
    dirtyRef.current = true
    setDirty(true)
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    setSaving(true)
    const saved = await saveSettings(draft)
    if (saved) {
      dirtyRef.current = false
      setDirty(false)
      setDraft(structuredClone(saved))
    }
    setSaving(false)
  }

  const test = async (target: TestTarget): Promise<void> => {
    if (!draft) return
    setTesting(target)
    const result = await testProvider(target, draft)
    dirtyRef.current = false
    setDirty(false)
    setResults((previous) => ({ ...previous, [target]: result }))
    setTesting(null)
  }

  const reset = async (): Promise<void> => {
    if (!window.confirm('恢复默认设置？已保存的 API Key 会被清空。')) return
    try {
      const defaults = await api.settings.reset()
      useAppStore.setState({ settings: defaults })
      setDraft(structuredClone(defaults))
      dirtyRef.current = false
      setDirty(false)
      notify('success', '已恢复默认设置')
    } catch (error) {
      notify('error', errorText(error))
    }
  }

  if (!draft) {
    return (
      <div className="flex-1 grid place-items-center text-mist-500 text-[13px] gap-3">
        <Loader2 size={20} className="spin text-amber-brand" />
        正在读取设置
      </div>
    )
  }

  const systemVoices =
    info?.platform === 'darwin' ? SYSTEM_VOICES.darwin : SYSTEM_VOICES.win32

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[980px] mx-auto px-8 py-8 pb-24">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] tracking-[0.28em] text-mist-500">SETTINGS</div>
            <h1 className="mt-2 text-[28px] font-semibold tracking-tight">设置</h1>
            <p className="mt-1.5 text-[13px] text-mist-500">
              供应商、并发与媒体路径。API Key 使用系统安全存储加密，不会暴露给界面。
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => void reset()}>
              <RotateCcw size={14} />
              恢复默认
            </button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              保存设置
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <Section
            icon={<Sparkles size={15} />}
            title="运行模式"
            description="演示模式完全离线：模板编剧 + 本地关键帧 + ffmpeg 运镜，不调用任何付费接口。"
          >
            <div className="flex items-center justify-between panel-soft px-4 py-3">
              <div>
                <div className="text-[12.5px] text-mist-300">优先演示模式</div>
                <div className="mt-0.5 text-[11px] text-mist-500">
                  开启后忽略剧本 / 图像 / 视频供应商，配音仍按下方配置执行。
                </div>
              </div>
              <Toggle
                checked={draft.demoMode}
                onChange={(value) =>
                  update((settings) => {
                    settings.demoMode = value
                  })
                }
              />
            </div>
          </Section>

          <Section
            icon={<Cpu size={15} />}
            title="剧本模型"
            description="任意 OpenAI 兼容的 Chat Completions 接口，输出 JSON 后自动校验与修复重试。"
            test={
              <TestButton
                target="text"
                loading={testing === 'text'}
                result={results.text}
                onTest={test}
              />
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="供应商">
                <select
                  className="select"
                  value={draft.providers.text.kind}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.text.kind = event.target.value as 'demo' | 'openai'
                    })
                  }
                >
                  <option value="demo">内置演示编剧</option>
                  <option value="openai">OpenAI 兼容</option>
                </select>
              </Field>
              <Field label="模型">
                <input
                  className="input"
                  value={draft.providers.text.model}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.text.model = event.target.value
                    })
                  }
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TEXT_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  className="btn btn-sm"
                  onClick={() =>
                    update((settings) => {
                      settings.providers.text.kind = 'openai'
                      settings.providers.text.baseUrl = preset.baseUrl
                      settings.providers.text.model = preset.model
                    })
                  }
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Base URL">
                <input
                  className="input"
                  value={draft.providers.text.baseUrl}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.text.baseUrl = event.target.value
                    })
                  }
                />
              </Field>
              <Field label="API Key" hint="已保存的 Key 显示为掩码，不改动则保留">
                <input
                  type="password"
                  className="input"
                  value={draft.providers.text.apiKey}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.text.apiKey = event.target.value
                    })
                  }
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label={`Temperature · ${draft.providers.text.temperature.toFixed(2)}`}>
                <input
                  type="range"
                  min="0"
                  max="1.4"
                  step="0.05"
                  className="w-full accent-amber-brand"
                  value={draft.providers.text.temperature}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.text.temperature = Number(event.target.value)
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          <Section
            icon={<ImageIcon size={15} />}
            title="图像 / 关键帧"
            description="支持 OpenAI 兼容 Images、可灵、ComfyUI 工作流。演示模式使用本地中文关键帧渲染。"
            test={
              <TestButton
                target="image"
                loading={testing === 'image'}
                result={results.image}
                onTest={test}
              />
            }
          >
            <div className="grid grid-cols-3 gap-3">
              <Field label="供应商">
                <select
                  className="select"
                  value={draft.providers.image.kind}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.image.kind = event.target.value as AppSettings['providers']['image']['kind']
                    })
                  }
                >
                  <option value="demo">演示关键帧</option>
                  <option value="openai">OpenAI 兼容</option>
                  <option value="kling">可灵</option>
                  <option value="comfyui">ComfyUI</option>
                </select>
              </Field>
              <Field label="模型">
                <input
                  className="input"
                  value={draft.providers.image.model}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.image.model = event.target.value
                    })
                  }
                />
              </Field>
              <Field label="尺寸">
                <input
                  className="input"
                  placeholder="1024x1536"
                  value={draft.providers.image.size}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.image.size = event.target.value
                    })
                  }
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {IMAGE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  className="btn btn-sm"
                  onClick={() =>
                    update((settings) => {
                      settings.providers.image.kind = preset.name === '可灵' ? 'kling' : preset.name === 'ComfyUI' ? 'comfyui' : 'openai'
                      settings.providers.image.baseUrl = preset.baseUrl
                      settings.providers.image.model = preset.model
                      if (preset.size) settings.providers.image.size = preset.size
                    })
                  }
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Base URL">
                <input
                  className="input"
                  value={draft.providers.image.baseUrl}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.image.baseUrl = event.target.value
                    })
                  }
                />
              </Field>
              <Field label="Access Key / API Key">
                <input
                  type="password"
                  className="input"
                  value={draft.providers.image.apiKey}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.image.apiKey = event.target.value
                    })
                  }
                />
              </Field>
            </div>
            {draft.providers.image.kind === 'kling' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Secret Key">
                  <input
                    type="password"
                    className="input"
                    value={draft.providers.image.secretKey}
                    onChange={(event) =>
                      update((settings) => {
                        settings.providers.image.secretKey = event.target.value
                      })
                    }
                  />
                </Field>
                <div className="hint self-end pb-2">可灵使用 Access Key + Secret Key 生成 JWT。</div>
              </div>
            )}
            {draft.providers.image.kind === 'comfyui' && (
              <div className="mt-3">
                <Field label="工作流 JSON" hint="支持 __PROMPT__ / __NEGATIVE__ / __SEED__ / __WIDTH__ / __HEIGHT__ 占位符">
                  <div className="flex gap-2">
                    <input
                      className="input"
                      value={draft.providers.image.workflowPath}
                      onChange={(event) =>
                        update((settings) => {
                          settings.providers.image.workflowPath = event.target.value
                        })
                      }
                    />
                    <button
                      className="btn"
                      onClick={() =>
                        void api.assets.pickWorkflow().then((path) => {
                          if (path)
                            update((settings) => {
                              settings.providers.image.workflowPath = path
                            })
                        })
                      }
                    >
                      选择
                    </button>
                  </div>
                </Field>
              </div>
            )}
          </Section>

          <Section
            icon={<Video size={15} />}
            title="视频模型"
            description="图生视频。可灵会按 5 秒/10 秒出片，合成时自动裁切到镜头时长。"
            test={
              <TestButton
                target="video"
                loading={testing === 'video'}
                result={results.video}
                onTest={test}
              />
            }
          >
            <div className="grid grid-cols-3 gap-3">
              <Field label="供应商">
                <select
                  className="select"
                  value={draft.providers.video.kind}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.video.kind = event.target.value as AppSettings['providers']['video']['kind']
                    })
                  }
                >
                  <option value="demo">本地运镜演示</option>
                  <option value="kling">可灵</option>
                  <option value="comfyui">ComfyUI</option>
                </select>
              </Field>
              <Field label="模型">
                <input
                  className="input"
                  value={draft.providers.video.model}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.video.model = event.target.value
                    })
                  }
                />
              </Field>
              <Field label="模式">
                <select
                  className="select"
                  value={draft.providers.video.mode}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.video.mode = event.target.value as 'std' | 'pro'
                    })
                  }
                >
                  <option value="std">标准</option>
                  <option value="pro">专业</option>
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {VIDEO_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  className="btn btn-sm"
                  onClick={() =>
                    update((settings) => {
                      settings.providers.video.kind = preset.name === '可灵' ? 'kling' : 'comfyui'
                      settings.providers.video.baseUrl = preset.baseUrl
                      settings.providers.video.model = preset.model
                    })
                  }
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Base URL">
                <input
                  className="input"
                  value={draft.providers.video.baseUrl}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.video.baseUrl = event.target.value
                    })
                  }
                />
              </Field>
              <Field label="超时（秒）">
                <input
                  type="number"
                  className="input"
                  value={draft.providers.video.timeoutSec}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.video.timeoutSec = Number(event.target.value) || 600
                    })
                  }
                />
              </Field>
            </div>
            {draft.providers.video.kind === 'kling' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Access Key">
                  <input
                    type="password"
                    className="input"
                    value={draft.providers.video.apiKey}
                    onChange={(event) =>
                      update((settings) => {
                        settings.providers.video.apiKey = event.target.value
                      })
                    }
                  />
                </Field>
                <Field label="Secret Key">
                  <input
                    type="password"
                    className="input"
                    value={draft.providers.video.secretKey}
                    onChange={(event) =>
                      update((settings) => {
                        settings.providers.video.secretKey = event.target.value
                      })
                    }
                  />
                </Field>
              </div>
            )}
            {draft.providers.video.kind === 'comfyui' && (
              <div className="mt-3">
                <Field label="工作流 JSON" hint="额外支持 __IMAGE__（上传的关键帧）与 __DURATION__">
                  <div className="flex gap-2">
                    <input
                      className="input"
                      value={draft.providers.video.workflowPath}
                      onChange={(event) =>
                        update((settings) => {
                          settings.providers.video.workflowPath = event.target.value
                        })
                      }
                    />
                    <button
                      className="btn"
                      onClick={() =>
                        void api.assets.pickWorkflow().then((path) => {
                          if (path)
                            update((settings) => {
                              settings.providers.video.workflowPath = path
                            })
                        })
                      }
                    >
                      选择
                    </button>
                  </div>
                </Field>
              </div>
            )}
          </Section>

          <Section
            icon={<Music2 size={15} />}
            title="配音"
            description="系统语音无需 Key；Windows 需安装中文语音包，macOS 自带中文语音。"
            test={
              <TestButton
                target="tts"
                loading={testing === 'tts'}
                result={results.tts}
                onTest={test}
              />
            }
          >
            <div className="grid grid-cols-3 gap-3">
              <Field label="供应商">
                <select
                  className="select"
                  value={draft.providers.tts.kind}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.tts.kind = event.target.value as AppSettings['providers']['tts']['kind']
                    })
                  }
                >
                  <option value="none">静音（只出字幕）</option>
                  <option value="system">系统语音</option>
                  <option value="openai">OpenAI 兼容 TTS</option>
                </select>
              </Field>
              <Field label="语速">
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  className="w-full accent-amber-brand"
                  value={draft.providers.tts.rate}
                  onChange={(event) =>
                    update((settings) => {
                      settings.providers.tts.rate = Number(event.target.value)
                    })
                  }
                />
              </Field>
              {draft.providers.tts.kind === 'system' ? (
                <Field label="系统语音">
                  <input
                    className="input"
                    list="system-voices"
                    placeholder="留空使用默认语音"
                    value={draft.providers.tts.systemVoice}
                    onChange={(event) =>
                      update((settings) => {
                        settings.providers.tts.systemVoice = event.target.value
                      })
                    }
                  />
                  <datalist id="system-voices">
                    {systemVoices.map((voice) => (
                      <option key={voice} value={voice} />
                    ))}
                  </datalist>
                </Field>
              ) : draft.providers.tts.kind === 'openai' ? (
                <Field label="Voice">
                  <select
                    className="select"
                    value={draft.providers.tts.voice}
                    onChange={(event) =>
                      update((settings) => {
                        settings.providers.tts.voice = event.target.value
                      })
                    }
                  >
                    {TTS_VOICES.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div className="self-end pb-2 hint">静音模式下镜头时长按台词字数估算。</div>
              )}
            </div>
            {draft.providers.tts.kind === 'openai' && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Field label="Base URL">
                  <input
                    className="input"
                    value={draft.providers.tts.baseUrl}
                    onChange={(event) =>
                      update((settings) => {
                        settings.providers.tts.baseUrl = event.target.value
                      })
                    }
                  />
                </Field>
                <Field label="模型">
                  <input
                    className="input"
                    value={draft.providers.tts.model}
                    onChange={(event) =>
                      update((settings) => {
                        settings.providers.tts.model = event.target.value
                      })
                    }
                  />
                </Field>
                <Field label="API Key">
                  <input
                    type="password"
                    className="input"
                    value={draft.providers.tts.apiKey}
                    onChange={(event) =>
                      update((settings) => {
                        settings.providers.tts.apiKey = event.target.value
                      })
                    }
                  />
                </Field>
              </div>
            )}
          </Section>

          <Section
            icon={<Settings2 size={15} />}
            title="媒体与并发"
            description="并发过高容易触发供应商限流；本地显卡生成建议图像 1–2、视频 1。"
          >
            <div className="grid grid-cols-4 gap-3">
              <Field label="图像并发">
                <input
                  type="number"
                  min="1"
                  max="8"
                  className="input"
                  value={draft.media.imageConcurrency}
                  onChange={(event) =>
                    update((settings) => {
                      settings.media.imageConcurrency = Math.max(1, Number(event.target.value) || 1)
                    })
                  }
                />
              </Field>
              <Field label="视频并发">
                <input
                  type="number"
                  min="1"
                  max="6"
                  className="input"
                  value={draft.media.videoConcurrency}
                  onChange={(event) =>
                    update((settings) => {
                      settings.media.videoConcurrency = Math.max(1, Number(event.target.value) || 1)
                    })
                  }
                />
              </Field>
              <Field label="帧率">
                <select
                  className="select"
                  value={draft.media.fps}
                  onChange={(event) =>
                    update((settings) => {
                      settings.media.fps = Number(event.target.value)
                    })
                  }
                >
                  {[24, 25, 30, 60].map((fps) => (
                    <option key={fps} value={fps}>
                      {fps} fps
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="字幕字体">
                <input
                  className="input"
                  placeholder="留空使用系统字体"
                  value={draft.media.subtitleFont}
                  onChange={(event) =>
                    update((settings) => {
                      settings.media.subtitleFont = event.target.value
                    })
                  }
                />
              </Field>
            </div>
            <div className="mt-3 flex items-center justify-between panel-soft px-4 py-3">
              <div>
                <div className="text-[12.5px] text-mist-300">烧录字幕</div>
                <div className="mt-0.5 text-[11px] text-mist-500">
                  关闭后成片不带字幕，仅在同目录生成 .srt 外挂文件。
                </div>
              </div>
              <Toggle
                checked={draft.media.burnSubtitles}
                onChange={(value) =>
                  update((settings) => {
                    settings.media.burnSubtitles = value
                  })
                }
              />
            </div>
          </Section>

          <Section
            icon={<Terminal size={15} />}
            title="媒体路径"
            description="留空使用随应用打包的 ffmpeg / ffprobe。需要特殊编码器时可指向系统安装路径。"
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="ffmpeg 路径">
                <input
                  className="input mono"
                  placeholder={info?.ffmpegPath || '内置 ffmpeg'}
                  value={draft.paths.ffmpegPath}
                  onChange={(event) =>
                    update((settings) => {
                      settings.paths.ffmpegPath = event.target.value
                    })
                  }
                />
              </Field>
              <Field label="ffprobe 路径">
                <input
                  className="input mono"
                  placeholder={info?.ffprobePath || '内置 ffprobe'}
                  value={draft.paths.ffprobePath}
                  onChange={(event) =>
                    update((settings) => {
                      settings.paths.ffprobePath = event.target.value
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          <Section
            icon={<FolderOpen size={15} />}
            title="关于与数据"
            description="所有项目、素材与成片都保存在本机，不上传云端。"
          >
            <div className="grid grid-cols-2 gap-3 text-[11.5px]">
              <div className="panel-soft px-4 py-3">
                <div className="text-mist-500">版本</div>
                <div className="mt-1 mono text-mist-300">{info?.version ?? '1.0.0'}</div>
                <div className="mt-2 text-mist-500">平台</div>
                <div className="mt-1 mono text-mist-300">
                  {info ? `${info.platform} / ${info.arch}` : '—'}
                </div>
              </div>
              <div className="panel-soft px-4 py-3">
                <div className="text-mist-500">用户数据目录</div>
                <div className="mt-1 mono text-mist-300 break-all">{info?.dataDir ?? '—'}</div>
                <button
                  className="btn btn-sm mt-2"
                  onClick={() => info && void api.system.openPath(info.dataDir)}
                >
                  <FolderOpen size={12} />
                  打开目录
                </button>
              </div>
            </div>
            <div className="mt-3 text-[10.5px] leading-relaxed text-mist-500">
              Key 通过 Electron safeStorage 加密：Windows 使用 DPAPI，macOS 使用 Keychain。
              若系统不支持加密，会退化为本地编码存储并在日志中提示。
            </div>
          </Section>
        </div>

        {dirty && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 panel px-4 py-2.5 flex items-center gap-3 fade-in">
            <span className="text-[11.5px] text-mist-400">有未保存的设置</span>
            <button className="btn btn-sm btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 size={12} className="spin" /> : <Save size={12} />}
              保存
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({
  icon,
  title,
  description,
  test,
  children
}: {
  icon: JSX.Element
  title: string
  description: string
  test?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <section className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <span className="h-7 w-7 rounded-lg bg-ink-800 border border-line grid place-items-center text-amber-brand shrink-0">
            {icon}
          </span>
          <div>
            <h2 className="text-[13.5px] font-semibold text-mist-300">{title}</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-mist-500">{description}</p>
          </div>
        </div>
        {test}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <div className="mt-1 text-[10px] text-mist-500/80">{hint}</div>}
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
        'relative h-6 w-11 rounded-full border transition-colors shrink-0',
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

function TestButton({
  target,
  loading,
  result,
  onTest
}: {
  target: TestTarget
  loading: boolean
  result?: TestResult
  onTest: (target: TestTarget) => Promise<void>
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 shrink-0">
      {result && (
        <span
          className={cn(
            'flex items-center gap-1 text-[10.5px] max-w-[230px]',
            result.ok ? 'text-emerald-300' : 'text-red-300'
          )}
          title={result.message}
        >
          {result.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
          <span className="truncate">{result.message}</span>
        </span>
      )}
      <button
        className="btn btn-sm"
        disabled={loading}
        onClick={() => void onTest(target)}
        title="保存当前设置并测试连接"
      >
        {loading ? <Loader2 size={12} className="spin" /> : '测试连接'}
      </button>
    </div>
  )
}
