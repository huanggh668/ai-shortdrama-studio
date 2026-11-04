import { hashString } from '../utils'
import { cardHtml, keyframeHtml, portraitHtml } from '../render/demoTemplates'
import type { ImageRenderer } from '../render/imageRenderer'
import type { ImageProvider, ImageRequest, ProviderTest } from './types'

export class DemoImageProvider implements ImageProvider {
  readonly id = 'demo-image'
  private readonly renderer: ImageRenderer

  constructor(renderer: ImageRenderer) {
    this.renderer = renderer
  }

  async generate(req: ImageRequest): Promise<{ path: string }> {
    const seed = req.seed ?? hashString(`${req.prompt}|${req.title ?? ''}|${req.kind ?? ''}`)
    let html: string
    if (req.kind === 'portrait') {
      html = portraitHtml({
        width: req.width,
        height: req.height,
        name: req.title ?? '角色',
        role: req.subtitle ?? '角色定妆',
        appearance: req.body ?? req.prompt,
        seed
      })
    } else if (req.kind === 'title' || req.kind === 'end') {
      html = cardHtml({
        width: req.width,
        height: req.height,
        title: req.title ?? '未命名短剧',
        subtitle: req.subtitle ?? '',
        kicker: req.kind === 'title' ? 'A DRAMAFORGE ORIGINAL' : '本集完',
        seed
      })
    } else {
      html = keyframeHtml({
        width: req.width,
        height: req.height,
        title: req.title ?? '关键帧',
        subtitle: req.subtitle ?? '',
        body: req.body ?? req.prompt.slice(0, 120),
        tag: req.kind === 'keyframe' ? 'KEYFRAME' : 'KEYFRAME',
        number: String((seed % 99) + 1).padStart(2, '0'),
        seed
      })
    }
    await this.renderer.render(html, req.width, req.height, req.outPath)
    return { path: req.outPath }
  }

  async test(): Promise<ProviderTest> {
    return { ok: true, message: '演示渲染器就绪：离线生成中文关键帧，无需 API Key' }
  }
}
