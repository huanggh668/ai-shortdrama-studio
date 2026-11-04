import { describe, expect, it } from 'vitest'
import type { Character, Project, Shot } from '../src/shared/types'
import { emptyStages } from '../src/main/services/projectStore'
import {
  composeImagePrompt,
  composePortraitPrompt,
  composeVideoPrompt
} from '../src/main/services/pipeline/prompts'

const project: Project = {
  schemaVersion: 1,
  id: 'p1',
  title: '测试',
  idea: '一句话',
  genre: '都市逆袭',
  style: '电影感写实',
  aspect: '9:16',
  language: 'zh',
  episodesCount: 1,
  episodeDuration: 60,
  subtitle: true,
  titleCard: true,
  episodes: [],
  stages: emptyStages(),
  createdAt: '',
  updatedAt: ''
}

const character: Character = {
  id: 'c1',
  name: '林晚',
  role: '主角',
  description: '被裁员的女孩',
  appearancePrompt: '短发，深灰西装，眼神冷静',
  personality: '克制',
  voice: '',
  portraitStatus: 'pending'
}

const shot: Shot = {
  id: 's1',
  episodeId: 'e1',
  no: 1,
  scene: '会议室',
  shotSize: '中景',
  cameraMove: '推镜',
  duration: 3,
  action: '林晚把文件推到桌子中央',
  dialogue: '这笔账我记了三年',
  narration: '',
  imagePrompt: '冷色调，浅景深',
  videoPrompt: '镜头缓慢推近',
  negativePrompt: '',
  image: { status: 'pending' },
  audio: { status: 'pending' },
  video: { status: 'pending' }
}

describe('prompts', () => {
  it('anchors matched characters into the image prompt', () => {
    const prompt = composeImagePrompt(shot, project, [character])
    expect(prompt).toContain('林晚')
    expect(prompt).toContain('深灰西装')
    expect(prompt).toContain('电影感写实')
    expect(prompt).toContain('竖屏 9:16')
  })

  it('appends camera and style to video prompt', () => {
    const prompt = composeVideoPrompt(shot, project)
    expect(prompt).toContain('推镜')
    expect(prompt).toContain('电影感写实')
  })

  it('builds a portrait prompt with appearance anchor', () => {
    const prompt = composePortraitPrompt(character, project)
    expect(prompt).toContain('角色定妆照')
    expect(prompt).toContain('短发')
  })

  it('caps prompt length', () => {
    const longShot = { ...shot, action: '很长的动作'.repeat(400) }
    expect(composeImagePrompt(longShot, project, [character]).length).toBeLessThanOrEqual(1600)
  })
})
