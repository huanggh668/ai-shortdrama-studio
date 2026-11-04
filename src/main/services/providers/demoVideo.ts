import type { MediaService } from '../media/ffmpeg'
import type { ProviderTest, VideoProvider, VideoRequest } from './types'

export class DemoVideoProvider implements VideoProvider {
  readonly id = 'demo-video'
  private readonly media: MediaService

  constructor(media: MediaService) {
    this.media = media
  }

  async generate(req: VideoRequest): Promise<{ path: string }> {
    if (!req.imagePath) throw new Error('演示视频需要先有关键帧画面')
    await this.media.imageToVideo({
      imagePath: req.imagePath,
      outPath: req.outPath,
      duration: req.duration,
      width: req.width,
      height: req.height,
      fps: req.fps,
      seed: req.seed,
      signal: req.signal
    })
    return { path: req.outPath }
  }

  async test(): Promise<ProviderTest> {
    return { ok: true, message: '演示视频引擎就绪：基于关键帧生成推拉摇移镜头' }
  }
}
