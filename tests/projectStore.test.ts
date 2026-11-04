import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectStore, createShot } from '../src/main/services/projectStore'
import type { CreateProjectInput } from '../src/shared/types'

const INPUT: CreateProjectInput = {
  idea: '被裁掉的女孩三年后回来复仇',
  genre: '都市逆袭',
  style: '电影感写实',
  aspect: '9:16',
  episodesCount: 2,
  episodeDuration: 60,
  subtitle: true,
  titleCard: true
}

describe('ProjectStore', () => {
  let root = ''
  let store: ProjectStore

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'dramaforge-store-'))
    store = new ProjectStore(path.join(root, 'projects'))
    await store.init()
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('creates, lists and loads a project', async () => {
    const project = await store.create(INPUT)
    expect(project.title).toBeTruthy()
    expect(project.stages.script.status).toBe('idle')
    const list = await store.list()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(project.id)
    const loaded = await store.get(project.id)
    expect(loaded.idea).toBe(INPUT.idea)
  })

  it('persists edits and returns newer updatedAt', async () => {
    const project = await store.create(INPUT)
    project.title = '新标题'
    const saved = await store.save(project)
    expect(saved.title).toBe('新标题')
    const loaded = await store.get(project.id)
    expect(loaded.title).toBe('新标题')
  })

  it('duplicates and removes projects', async () => {
    const project = await store.create(INPUT)
    const copy = await store.duplicate(project.id)
    expect(copy.id).not.toBe(project.id)
    expect(copy.title).toContain('副本')
    expect(await store.list()).toHaveLength(2)
    await store.remove(copy.id)
    expect(await store.list()).toHaveLength(1)
  })

  it('normalizes shots on load', async () => {
    const project = await store.create(INPUT)
    const shot = createShot('ep1', 1, { dialogue: '你好' })
    project.episodes = [
      { id: 'ep1', index: 1, title: '第一集', synopsis: '', shots: [shot] }
    ]
    await store.save(project)
    const loaded = await store.get(project.id)
    expect(loaded.episodes[0].shots[0].dialogue).toBe('你好')
    expect(loaded.episodes[0].shots[0].no).toBe(1)
  })

  it('blocks path traversal', () => {
    expect(() => store.assetPath('abc', '..', '..', 'secret.txt')).toThrow()
  })
})
