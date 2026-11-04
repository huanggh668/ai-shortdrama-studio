import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { TtsProviderSettings } from '../../../shared/types'
import type { MediaService } from '../media/ffmpeg'
import { clamp, ensureDir } from '../utils'
import type { ProviderTest, TtsProvider, TtsRequest } from './types'

const execFileAsync = promisify(execFile)

const WIN_SCRIPT = [
  'param([string]$TextFile,[string]$OutFile,[string]$Voice,[int]$Rate)',
  'Add-Type -AssemblyName System.Speech',
  '$text = [System.IO.File]::ReadAllText($TextFile,[System.Text.Encoding]::UTF8)',
  '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  "if ($Voice -ne '') { try { $synth.SelectVoice($Voice) } catch {} }",
  '$synth.Rate = $Rate',
  '$synth.SetOutputToWaveFile($OutFile)',
  '$synth.Speak($text)',
  '$synth.Dispose()'
].join('\n')

const WIN_VOICES = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Speech',
  '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  '$synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }'
].join('\n')

export class SystemTtsProvider implements TtsProvider {
  readonly id = 'system-tts'
  private readonly cfg: TtsProviderSettings
  private readonly media: MediaService

  constructor(cfg: TtsProviderSettings, media: MediaService) {
    this.cfg = cfg
    this.media = media
  }

  async synthesize(req: TtsRequest): Promise<{ path: string; duration: number }> {
    const text = req.text.trim()
    if (!text) throw new Error('配音文本为空')
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dramaforge-tts-'))
    const textFile = path.join(workDir, 'text.txt')
    const rate = clamp(Math.round(req.rate ?? this.cfg.rate ?? 0), -10, 10)
    await fs.writeFile(textFile, text, 'utf8')
    try {
      let rawPath: string
      if (process.platform === 'win32') {
        rawPath = path.join(workDir, 'raw.wav')
        const scriptPath = path.join(workDir, 'speak.ps1')
        await fs.writeFile(scriptPath, `﻿${WIN_SCRIPT}`, 'utf8')
        const voice = req.voice || this.cfg.systemVoice || ''
        await execFileAsync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            scriptPath,
            '-TextFile',
            textFile,
            '-OutFile',
            rawPath,
            '-Voice',
            voice,
            '-Rate',
            String(rate)
          ],
          { timeout: 240000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
        )
      } else if (process.platform === 'darwin') {
        rawPath = path.join(workDir, 'raw.aiff')
        const voice = req.voice || this.cfg.systemVoice
        const args: string[] = []
        if (voice) args.push('-v', voice)
        args.push('-r', String(Math.round(175 + rate * 8)), '-f', textFile, '-o', rawPath)
        await execFileAsync('say', args, { timeout: 240000, maxBuffer: 10 * 1024 * 1024 })
      } else {
        throw new Error('当前系统不支持内置语音，请改用 OpenAI 兼容 TTS 或静音模式')
      }
      const stat = await fs.stat(rawPath).catch(() => null)
      if (!stat || stat.size < 200) throw new Error('系统语音没有生成有效音频（可能缺少中文语音包）')
      await ensureDir(path.dirname(req.outPath))
      await this.media.toWav(rawPath, req.outPath)
      const info = await this.media.probe(req.outPath)
      return { path: req.outPath, duration: info.duration || 1 }
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  async test(): Promise<ProviderTest> {
    try {
      if (process.platform === 'win32') {
        const scriptPath = path.join(os.tmpdir(), `dramaforge-voices-${Date.now()}.ps1`)
        await fs.writeFile(scriptPath, `﻿${WIN_VOICES}`, 'utf8')
        try {
          const { stdout } = await execFileAsync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
            { timeout: 60000, windowsHide: true }
          )
          const voices = stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
          return {
            ok: true,
            message: voices.length
              ? `系统语音可用（${voices.length} 个）：${voices.slice(0, 4).join('、')}`
              : '系统语音可用，但未检测到已安装语音包'
          }
        } finally {
          await fs.rm(scriptPath, { force: true }).catch(() => undefined)
        }
      }
      if (process.platform === 'darwin') {
        const { stdout } = await execFileAsync('say', ['-v', '?'], { timeout: 30000 })
        const count = stdout.split(/\r?\n/).filter((line) => line.trim()).length
        return { ok: true, message: `macOS 系统语音可用（${count} 个）` }
      }
      return { ok: false, message: '当前系统不支持内置语音' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
}
