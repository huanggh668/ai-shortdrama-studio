import { describe, expect, it } from 'vitest'
import { DemoStoryEngine } from '../src/main/services/providers/storyDemo'

const INPUT = {
  title: '被裁掉的女孩',
  idea: '被公司恶意裁员的女孩，三年后以投资人的身份回到会议室，当众揭穿当年构陷她的上司。',
  genre: '都市逆袭',
  style: '电影感写实',
  aspect: '9:16',
  episodesCount: 3,
  episodeDuration: 60
}

describe('DemoStoryEngine', () => {
  it('creates a consistent bible', async () => {
    const engine = new DemoStoryEngine()
    const bible = await engine.createBible(INPUT)
    expect(bible.characters.length).toBeGreaterThanOrEqual(3)
    expect(bible.outlines).toHaveLength(3)
    expect(bible.logline).toBe(INPUT.idea)
    for (const character of bible.characters) {
      expect(character.name.length).toBeGreaterThan(1)
      expect(character.appearancePrompt.length).toBeGreaterThan(8)
    }
  })

  it('creates shots near the target duration', async () => {
    const engine = new DemoStoryEngine()
    const bible = await engine.createBible(INPUT)
    const shots = await engine.createShots({
      project: INPUT,
      bible: {
        logline: bible.logline,
        synopsis: bible.synopsis,
        tone: bible.tone,
        characters: bible.characters
      },
      episode: bible.outlines[0],
      episodeIndex: 0
    })
    expect(shots.length).toBeGreaterThanOrEqual(6)
    const total = shots.reduce((sum, shot) => sum + shot.duration, 0)
    expect(Math.abs(total - INPUT.episodeDuration)).toBeLessThan(INPUT.episodeDuration * 0.2)
    expect(shots.every((shot) => shot.imagePrompt.includes(INPUT.style))).toBe(true)
    expect(shots[0].narration.length).toBeGreaterThan(0)
  })

  it('is deterministic for the same idea', async () => {
    const a = await new DemoStoryEngine().createBible(INPUT)
    const b = await new DemoStoryEngine().createBible(INPUT)
    expect(a.characters.map((item) => item.name)).toEqual(b.characters.map((item) => item.name))
  })
})
