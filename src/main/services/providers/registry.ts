import type { AppSettings, TestResult, TestTarget } from '../../../shared/types'
import type { MediaService } from '../media/ffmpeg'
import type { ImageRenderer } from '../render/imageRenderer'
import { ComfyImageProvider, ComfyVideoProvider } from './comfyui'
import { DemoImageProvider } from './demoImage'
import { DemoVideoProvider } from './demoVideo'
import { KlingImageProvider, KlingVideoProvider } from './kling'
import { OpenAiImageProvider } from './openaiImage'
import { OpenAiTextProvider } from './openaiText'
import { OpenAiTtsProvider } from './openaiTts'
import { SilentTtsProvider } from './silentTts'
import { DemoStoryEngine } from './storyDemo'
import { LlmStoryEngine } from './storyLlm'
import { SystemTtsProvider } from './systemTts'
import type {
  ImageProvider,
  ProviderTest,
  StoryEngine,
  TextProvider,
  TtsProvider,
  VideoProvider
} from './types'

export interface ProviderBundle {
  story: StoryEngine
  image: ImageProvider
  video: VideoProvider
  tts: TtsProvider
  demo: boolean
  notes: string[]
}

export function createProviderBundle(
  settings: AppSettings,
  media: MediaService,
  renderer: ImageRenderer
): ProviderBundle {
  const notes: string[] = []
  const demo = settings.demoMode
  let story: StoryEngine
  let image: ImageProvider
  let video: VideoProvider
  let tts: TtsProvider

  if (!demo && settings.providers.text.kind === 'openai' && settings.providers.text.apiKey) {
    story = new LlmStoryEngine(new OpenAiTextProvider(settings.providers.text))
  } else {
    story = new DemoStoryEngine()
    if (!demo) notes.push('剧本模型未配置 Key，已回退内置演示编剧')
  }

  if (!demo) {
    image = buildImage(settings, renderer, notes)
    video = buildVideo(settings, media, notes)
  } else {
    image = new DemoImageProvider(renderer)
    video = new DemoVideoProvider(media)
  }

  const ttsCfg = settings.providers.tts
  if (ttsCfg.kind === 'openai' && ttsCfg.apiKey && !demo) {
    tts = new OpenAiTtsProvider(ttsCfg, media)
  } else if (ttsCfg.kind === 'system') {
    tts = new SystemTtsProvider(ttsCfg, media)
  } else {
    tts = new SilentTtsProvider(media)
    if (ttsCfg.kind === 'openai' && demo) notes.push('演示模式使用静音配音，接真实模型后可启用云端 TTS')
  }

  return { story, image, video, tts, demo, notes }
}

function buildImage(settings: AppSettings, renderer: ImageRenderer, notes: string[]): ImageProvider {
  const cfg = settings.providers.image
  if (cfg.kind === 'openai' && cfg.apiKey) return new OpenAiImageProvider(cfg)
  if (cfg.kind === 'kling' && cfg.apiKey && cfg.secretKey) return new KlingImageProvider(cfg)
  if (cfg.kind === 'comfyui' && cfg.workflowPath) return new ComfyImageProvider(cfg)
  notes.push('图像模型配置不完整，已回退演示关键帧')
  return new DemoImageProvider(renderer)
}

function buildVideo(settings: AppSettings, media: MediaService, notes: string[]): VideoProvider {
  const cfg = settings.providers.video
  if (cfg.kind === 'kling' && cfg.apiKey && cfg.secretKey) return new KlingVideoProvider(cfg)
  if (cfg.kind === 'comfyui' && cfg.workflowPath) return new ComfyVideoProvider(cfg)
  notes.push('视频模型配置不完整，已回退本地运镜演示')
  return new DemoVideoProvider(media)
}

export async function testProvider(
  target: TestTarget,
  settings: AppSettings,
  media: MediaService,
  renderer: ImageRenderer
): Promise<TestResult> {
  let provider: { test(): Promise<ProviderTest> } | null = null
  const providers = settings.providers
  if (target === 'text') {
    if (providers.text.kind === 'demo') {
      return { ok: true, message: '内置演示编剧可用（无需 Key）' }
    }
    provider = new OpenAiTextProvider(providers.text)
  } else if (target === 'image') {
    const cfg = providers.image
    if (cfg.kind === 'demo') return { ok: true, message: '演示关键帧渲染器可用（无需 Key）' }
    if (cfg.kind === 'openai') provider = new OpenAiImageProvider(cfg)
    else if (cfg.kind === 'kling') provider = new KlingImageProvider(cfg)
    else if (cfg.kind === 'comfyui') provider = new ComfyImageProvider(cfg)
  } else if (target === 'video') {
    const cfg = providers.video
    if (cfg.kind === 'demo') return { ok: true, message: '演示运镜引擎可用（无需 Key）' }
    if (cfg.kind === 'kling') provider = new KlingVideoProvider(cfg)
    else if (cfg.kind === 'comfyui') provider = new ComfyVideoProvider(cfg)
  } else {
    const cfg = providers.tts
    if (cfg.kind === 'none') return { ok: true, message: '静音配音模式可用' }
    if (cfg.kind === 'system') provider = new SystemTtsProvider(cfg, media)
    else if (cfg.kind === 'openai') provider = new OpenAiTtsProvider(cfg, media)
  }
  if (!provider) return { ok: false, message: '该供应商尚未完成配置' }
  try {
    return await provider.test()
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export function createTextProvider(settings: AppSettings): TextProvider | null {
  if (settings.providers.text.kind === 'openai' && settings.providers.text.apiKey) {
    return new OpenAiTextProvider(settings.providers.text)
  }
  return null
}

export { DemoStoryEngine, LlmStoryEngine, SilentTtsProvider, SystemTtsProvider }
