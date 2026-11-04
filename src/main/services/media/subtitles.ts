import type { Shot } from '../../../shared/types'

export interface SubtitleCue {
  start: number
  end: number
  text: string
}

export function effectiveDuration(shot: Shot): number {
  const audio = shot.audio.duration ?? 0
  return Math.max(shot.duration || 3, audio + 0.3)
}

export function shotText(shot: Shot): string {
  return (shot.dialogue || shot.narration || '').trim()
}

export function buildCues(shots: Shot[], offset = 0): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  let cursor = offset
  for (const shot of shots) {
    const duration = effectiveDuration(shot)
    const text = shotText(shot)
    if (text) {
      const end = cursor + Math.max(0.6, duration - 0.12)
      cues.push({ start: cursor, end, text: wrapText(text) })
    }
    cursor += duration
  }
  return cues
}

export function wrapText(text: string, maxChars = 16, maxLines = 2): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const lines: string[] = []
  let current = ''
  for (const char of clean) {
    current += char
    if (current.length >= maxChars) {
      lines.push(current)
      current = ''
      if (lines.length >= maxLines) break
    }
  }
  if (lines.length < maxLines && current) lines.push(current)
  if (lines.length === 0) return clean
  if (lines.join('').length < clean.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[，。！？、；：,.!?;:]$/, '')}…`
  }
  return lines.join('\n')
}

export function formatSrtTime(seconds: number): string {
  const total = Math.max(0, seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = Math.floor(total % 60)
  const ms = Math.round((total - Math.floor(total)) * 1000)
  const pad = (value: number, size = 2): string => String(value).padStart(size, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`
}

export function formatAssTime(seconds: number): string {
  const total = Math.max(0, seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = Math.floor(total % 60)
  const cs = Math.round((total - Math.floor(total)) * 100)
  const pad = (value: number, size = 2): string => String(value).padStart(size, '0')
  return `${hours}:${pad(minutes)}:${pad(secs)}.${pad(cs)}`
}

export function toSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue, index) => {
      const text = cue.text.replace(/\n/g, '\r\n')
      return `${index + 1}\r\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\r\n${text}\r\n`
    })
    .join('\r\n')
}

export function toAss(
  cues: SubtitleCue[],
  options: { width: number; height: number; fontName?: string; fontSize?: number }
): string {
  const { width, height } = options
  const fontName = options.fontName || defaultFontName()
  const fontSize = options.fontSize ?? Math.round(width / 20)
  const marginV = Math.round(height * 0.09)
  const outline = Math.max(2, Math.round(fontSize / 18))
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${fontName},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,-1,0,0,0,100,100,0,0,1,${outline},1,2,80,80,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ].join('\n')
  const events = cues.map((cue) => {
    const text = cue.text
      .split('\n')
      .map((line) => escapeAss(line))
      .join('\\N')
    return `Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Default,,0,0,0,,${text}`
  })
  return `${header}\n${events.join('\n')}\n`
}

export function totalDuration(shots: Shot[]): number {
  return shots.reduce((sum, shot) => sum + effectiveDuration(shot), 0)
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '｛').replace(/\}/g, '｝')
}

export function defaultFontName(): string {
  if (process.platform === 'darwin') return 'PingFang SC'
  if (process.platform === 'win32') return 'Microsoft YaHei'
  return 'Noto Sans CJK SC'
}
