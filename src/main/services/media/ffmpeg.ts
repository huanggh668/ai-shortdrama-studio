import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { ensureDir, formatError } from '../utils'

export interface ProbeResult {
  duration: number
  width: number
  height: number
  hasAudio: boolean
}

interface RunOptions {
  signal?: AbortSignal
  cwd?: string
  timeoutMs?: number
}

function unpacked(binaryPath: string): string {
  return binaryPath.includes('app.asar')
    ? binaryPath.replace('app.asar', 'app.asar.unpacked')
    : binaryPath
}

const DEFAULT_FFMPEG = unpacked((ffmpegStatic as unknown as string) ?? 'ffmpeg')
const DEFAULT_FFPROBE = unpacked((ffprobeStatic as unknown as { path: string }).path ?? 'ffprobe')

export class MediaService {
  private ffmpegBinary = DEFAULT_FFMPEG
  private ffprobeBinary = DEFAULT_FFPROBE
  private subtitlesSupport: boolean | null = null

  constructor(paths: { ffmpegPath?: string; ffprobePath?: string } = {}) {
    this.configure(paths)
  }

  configure(paths: { ffmpegPath?: string; ffprobePath?: string }): void {
    this.ffmpegBinary = paths.ffmpegPath?.trim() ? unpacked(paths.ffmpegPath.trim()) : DEFAULT_FFMPEG
    this.ffprobeBinary = paths.ffprobePath?.trim() ? unpacked(paths.ffprobePath.trim()) : DEFAULT_FFPROBE
    this.subtitlesSupport = null
  }

  get ffmpegPath(): string {
    return this.ffmpegBinary
  }

  get ffprobePath(): string {
    return this.ffprobeBinary
  }

  async run(args: string[], options: RunOptions = {}): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new DOMException('已取消', 'AbortError'))
        return
      }
      const child = spawn(this.ffmpegBinary, ['-hide_banner', '-nostdin', ...args], {
        cwd: options.cwd,
        windowsHide: true
      })
      let stdout = ''
      let stderr = ''
      const timeout = options.timeoutMs
        ? setTimeout(() => {
            child.kill('SIGKILL')
            reject(new Error('ffmpeg 执行超时'))
          }, options.timeoutMs)
        : null
      const onAbort = (): void => {
        child.kill('SIGKILL')
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
        if (stderr.length > 20000) stderr = stderr.slice(-20000)
      })
      child.on('error', (error) => {
        if (timeout) clearTimeout(timeout)
        options.signal?.removeEventListener('abort', onAbort)
        reject(error)
      })
      child.on('close', (code) => {
        if (timeout) clearTimeout(timeout)
        options.signal?.removeEventListener('abort', onAbort)
        if (options.signal?.aborted) {
          reject(new DOMException('已取消', 'AbortError'))
          return
        }
        if (code === 0) resolve(stdout)
        else reject(new Error(`ffmpeg 失败 (${code})：${stderr.slice(-1600).trim()}`))
      })
    })
  }

  async probe(file: string): Promise<ProbeResult> {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        this.ffprobeBinary,
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
        { windowsHide: true }
      )
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve(stdout)
        else reject(new Error(`ffprobe 失败：${stderr.trim()}`))
      })
    })
    const parsed = JSON.parse(output) as {
      format?: { duration?: string }
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>
    }
    const video = parsed.streams?.find((stream) => stream.codec_type === 'video')
    return {
      duration: Number.parseFloat(parsed.format?.duration ?? '0') || 0,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      hasAudio: Boolean(parsed.streams?.some((stream) => stream.codec_type === 'audio'))
    }
  }

  async imageToVideo(options: {
    imagePath: string
    outPath: string
    duration: number
    width: number
    height: number
    fps: number
    seed?: number
    signal?: AbortSignal
  }): Promise<void> {
    const { imagePath, outPath, duration, width, height, fps } = options
    const frames = Math.max(1, Math.round(duration * fps))
    const effects = ['zoom-in', 'zoom-out', 'pan-right', 'pan-left']
    const effect = effects[Math.abs(options.seed ?? 0) % effects.length]
    const preW = Math.round(width * 1.12)
    const preH = Math.round(height * 1.12)
    let zoomExpr = 'min(zoom+0.0009,1.12)'
    let xExpr = 'iw/2-(iw/zoom/2)'
    let yExpr = 'ih/2-(ih/zoom/2)'
    if (effect === 'zoom-out') {
      zoomExpr = 'max(1.12-0.0009*on,1.0)'
    } else if (effect === 'pan-right') {
      zoomExpr = '1.08'
      xExpr = `(iw-iw/zoom)*on/${frames}`
      yExpr = 'ih/2-(ih/zoom/2)'
    } else if (effect === 'pan-left') {
      zoomExpr = '1.08'
      xExpr = `(iw-iw/zoom)*(1-on/${frames})`
      yExpr = 'ih/2-(ih/zoom/2)'
    }
    await ensureDir(path.dirname(outPath))
    const filter = [
      `scale=${preW}:${preH}:force_original_aspect_ratio=increase`,
      `crop=${preW}:${preH}`,
      `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${width}x${height}:fps=${fps}`,
      'format=yuv420p'
    ].join(',')
    await this.run(
      [
        '-y',
        '-loop', '1',
        '-i', imagePath,
        '-vf', filter,
        '-frames:v', String(frames),
        '-r', String(fps),
        '-t', String(duration),
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outPath
      ],
      { signal: options.signal, timeoutMs: 15 * 60 * 1000 }
    )
  }

  async normalizeShot(options: {
    videoPath: string
    audioPath?: string
    outPath: string
    width: number
    height: number
    fps: number
    duration: number
    signal?: AbortSignal
  }): Promise<void> {
    const { videoPath, audioPath, outPath, width, height, fps, duration } = options
    const audioIndex = 1
    const args: string[] = ['-y', '-i', videoPath]
    if (audioPath) {
      args.push('-i', audioPath)
    } else {
      args.push(
        '-f', 'lavfi',
        '-t', String(duration),
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'
      )
    }
    const videoChain = [
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      'setsar=1',
      `tpad=stop_mode=clone:stop_duration=${duration}`,
      `fps=${fps}`,
      'format=yuv420p[v]'
    ].join(',')
    const audioChain = [
      `[${audioIndex}:a]apad=whole_dur=${duration}`,
      `atrim=0:${duration}`,
      'asetpts=N/SR/TB',
      'aformat=sample_rates=48000:channel_layouts=stereo[aout]'
    ].join(',')
    args.push(
      '-filter_complex',
      `${videoChain};${audioChain}`,
      '-map', '[v]',
      '-map', '[aout]',
      '-t', String(duration),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-ac', '2',
      '-movflags', '+faststart',
      outPath
    )
    await ensureDir(path.dirname(outPath))
    await this.run(args, { signal: options.signal, timeoutMs: 20 * 60 * 1000 })
  }

  async concat(files: string[], outPath: string, signal?: AbortSignal): Promise<void> {
    if (files.length === 0) throw new Error('没有可拼接的视频片段')
    if (files.length === 1) {
      await fs.copyFile(files[0], outPath)
      return
    }
    const listPath = path.join(path.dirname(outPath), `concat-${Date.now()}.txt`)
    const body = files
      .map((file) => `file '${file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n')
    await fs.writeFile(listPath, body, 'utf8')
    try {
      await this.run(
        ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', outPath],
        { signal, timeoutMs: 20 * 60 * 1000 }
      )
    } finally {
      await fs.rm(listPath, { force: true }).catch(() => undefined)
    }
  }

  async mixBgm(options: {
    videoPath: string
    bgmPath: string
    outPath: string
    volume: number
    signal?: AbortSignal
  }): Promise<void> {
    const info = await this.probe(options.videoPath)
    const duration = Math.max(0.5, info.duration)
    const fadeStart = Math.max(0, duration - 1.5)
    await this.run(
      [
        '-y',
        '-i', options.videoPath,
        '-stream_loop', '-1',
        '-i', options.bgmPath,
        '-filter_complex',
        [
          `[1:a]volume=${options.volume},atrim=0:${duration},asetpts=N/SR/TB,afade=t=out:st=${fadeStart}:d=1.5[bg]`,
          '[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[aout]'
        ].join(';'),
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-ac', '2',
        '-movflags', '+faststart',
        options.outPath
      ],
      { signal: options.signal, timeoutMs: 20 * 60 * 1000 }
    )
  }

  async burnSubtitles(options: {
    videoPath: string
    assPath: string
    outPath: string
    signal?: AbortSignal
  }): Promise<void> {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dramaforge-sub-'))
    try {
      await fs.copyFile(options.assPath, path.join(workDir, 'subs.ass'))
      await this.run(
        [
          '-y',
          '-i', options.videoPath,
          '-vf', 'subtitles=subs.ass',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '20',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'copy',
          '-movflags', '+faststart',
          options.outPath
        ],
        { cwd: workDir, signal: options.signal, timeoutMs: 30 * 60 * 1000 }
      )
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  async supportsSubtitles(): Promise<boolean> {
    if (this.subtitlesSupport !== null) return this.subtitlesSupport
    try {
      const output = await this.run(['-filters'])
      this.subtitlesSupport = /\bsubtitles\b/.test(output)
    } catch {
      this.subtitlesSupport = false
    }
    return this.subtitlesSupport
  }

  async silentWav(outPath: string, duration: number): Promise<void> {
    await ensureDir(path.dirname(outPath))
    await this.run(
      [
        '-y',
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=mono:sample_rate=48000',
        '-t', String(Math.max(0.2, duration)),
        '-c:a', 'pcm_s16le',
        outPath
      ],
      { timeoutMs: 60000 }
    )
  }

  async toWav(inputPath: string, outPath: string): Promise<void> {
    await ensureDir(path.dirname(outPath))
    await this.run(
      [
        '-y',
        '-i', inputPath,
        '-vn',
        '-ac', '1',
        '-ar', '48000',
        '-c:a', 'pcm_s16le',
        outPath
      ],
      { timeoutMs: 120000 }
    )
  }

  async extractCover(videoPath: string, outPath: string): Promise<void> {
    await this.run(
      ['-y', '-ss', '0.5', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=720:-2', outPath],
      { timeoutMs: 120000 }
    )
  }

  formatError(error: unknown): string {
    return formatError(error)
  }
}
