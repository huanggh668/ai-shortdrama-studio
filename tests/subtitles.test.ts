import { describe, expect, it } from 'vitest'
import type { Shot } from '../src/shared/types'
import {
  buildCues,
  effectiveDuration,
  formatAssTime,
  formatSrtTime,
  toAss,
  toSrt,
  totalDuration,
  wrapText
} from '../src/main/services/media/subtitles'

function shot(partial: Partial<Shot> = {}): Shot {
  return {
    id: partial.id ?? 's1',
    episodeId: 'e1',
    no: partial.no ?? 1,
    scene: '办公室',
    shotSize: '中景',
    cameraMove: '固定',
    duration: partial.duration ?? 3,
    action: '',
    dialogue: partial.dialogue ?? '',
    narration: partial.narration ?? '',
    imagePrompt: '',
    videoPrompt: '',
    negativePrompt: '',
    image: { status: 'pending' },
    audio: partial.audio ?? { status: 'pending' },
    video: { status: 'pending' }
  }
}

describe('subtitles', () => {
  it('uses the longer of shot duration and audio duration', () => {
    expect(effectiveDuration(shot({ duration: 2, audio: { status: 'done', duration: 4.2 } }))).toBeCloseTo(4.5)
    expect(effectiveDuration(shot({ duration: 5 }))).toBe(5)
  })

  it('builds sequential cues with an offset', () => {
    const cues = buildCues(
      [
        shot({ dialogue: '这笔账我记了三年', duration: 3 }),
        shot({ narration: '空气突然安静', duration: 2, audio: { status: 'done', duration: 2.4 } }),
        shot({ duration: 2 })
      ],
      2
    )
    expect(cues).toHaveLength(2)
    expect(cues[0].start).toBe(2)
    expect(cues[0].end).toBeCloseTo(4.88)
    expect(cues[1].start).toBe(5)
    expect(cues[1].end).toBeCloseTo(7.58)
    expect(totalDuration([shot({ duration: 2, audio: { status: 'done', duration: 5 } })])).toBeCloseTo(5.3)
  })

  it('wraps long text into at most two lines', () => {
    const wrapped = wrapText('这是一句非常非常长的台词用来测试字幕换行是否正常工作并且不会超过两行', 10, 2)
    expect(wrapped.split('\n').length).toBe(2)
    expect(wrapped).toContain('…')
  })

  it('formats srt and ass timestamps', () => {
    expect(formatSrtTime(3661.256)).toBe('01:01:01,256')
    expect(formatAssTime(3661.256)).toBe('1:01:01.26')
  })

  it('escapes ass braces and emits styles', () => {
    const ass = toAss([{ start: 0, end: 2, text: '他说{别动}' }], {
      width: 1080,
      height: 1920,
      fontName: 'Microsoft YaHei'
    })
    expect(ass).toContain('PlayResX: 1080')
    expect(ass).toContain('Microsoft YaHei')
    expect(ass).toContain('｛别动｝')
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:02.00')
  })

  it('emits srt entries', () => {
    const srt = toSrt([{ start: 1, end: 2.5, text: '第一行\n第二行' }])
    expect(srt).toContain('00:00:01,000 --> 00:00:02,500')
    expect(srt).toContain('第一行\r\n第二行')
  })
})
