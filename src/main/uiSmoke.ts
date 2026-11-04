import { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { sleep } from './services/utils'

const OUT_DIR = 'C:/Projects/tmp/ai-shortdrama-ui'

export async function runUiSmoke(win: BrowserWindow): Promise<number> {
  const errors: string[] = []
  let createdId = ''
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message)
  })
  try {
    await sleep(2000)
    await fs.mkdir(OUT_DIR, { recursive: true })
    const homeState = await evaluate(win, `(() => {
      const root = document.getElementById('root');
      return {
        api: typeof window.api,
        rootChildren: root ? root.childElementCount : -1,
        text: document.body.innerText.slice(0, 120)
      };
    })()`)
    await capture(win, 'ui-home.png')

    await evaluate(
      win,
      `(async () => {
        window.__uiSmokeSettings = await window.api.settings.get();
        const next = structuredClone(window.__uiSmokeSettings);
        next.demoMode = true;
        if (next.providers.tts.kind === 'openai') next.providers.tts.kind = 'system';
        await window.api.settings.save(next);
        return true;
      })()`
    )

    const created = (await evaluate(
      win,
      `window.api.projects.create({
        idea: '被公司恶意裁员的女孩，三年后以投资人身份回到会议室，当众揭穿构陷她的上司。',
        title: 'UI 验证短剧',
        genre: '都市逆袭',
        style: '电影感写实',
        aspect: '9:16',
        episodesCount: 1,
        episodeDuration: 10,
        subtitle: true,
        titleCard: true
      }).then((project) => ({ id: project.id }))`
    )) as { id: string }
    createdId = created.id

    await evaluate(win, `location.hash = '#/project/${created.id}/overview'`)
    await sleep(1400)
    await capture(win, 'ui-overview.png')

    const started = Date.now()
    await evaluate(win, `window.api.pipeline.run({ projectId: '${created.id}' })`)
    await sleep(4500)
    await capture(win, 'ui-running.png')

    let status = 'idle'
    for (let i = 0; i < 80; i += 1) {
      const state = (await evaluate(
        win,
        `window.api.projects.get('${created.id}').then((project) => ({
          render: project.stages.render.status,
          images: project.stages.images.status,
          videos: project.stages.videos.status,
          exports: project.exports ? Object.keys(project.exports).length : 0
        }))`
      )) as { render: string; images: string; videos: string; exports: number }
      status = state.render
      if (state.render === 'done' && state.exports > 0) break
      if (state.render === 'failed') throw new Error('流水线 render 阶段失败')
      await sleep(3000)
    }
    if (status !== 'done') throw new Error('等待流水线完成超时')

    await evaluate(win, `location.hash = '#/project/${created.id}/storyboard'`)
    await sleep(1600)
    await capture(win, 'ui-storyboard.png')

    await evaluate(win, `location.hash = '#/project/${created.id}/preview'`)
    await sleep(1600)
    await capture(win, 'ui-preview.png')

    const report = {
      ok: true,
      api: (homeState as { api: string }).api,
      rootChildren: (homeState as { rootChildren: number }).rootChildren,
      projectId: created.id,
      elapsedSec: Math.round((Date.now() - started) / 1000),
      screenshots: [
        `${OUT_DIR}/ui-home.png`,
        `${OUT_DIR}/ui-overview.png`,
        `${OUT_DIR}/ui-running.png`,
        `${OUT_DIR}/ui-storyboard.png`,
        `${OUT_DIR}/ui-preview.png`
      ],
      errors
    }
    process.stdout.write(`UI_SMOKE ${JSON.stringify(report)}\n`)
    return errors.length === 0 ? 0 : 1
  } catch (error) {
    process.stderr.write(
      `UI_SMOKE_FAIL ${error instanceof Error ? error.message : String(error)}\n`
    )
    return 1
  } finally {
    try {
      if (createdId) {
        await evaluate(win, `window.api.projects.remove('${createdId}')`)
      }
      await evaluate(
        win,
        `(async () => {
          if (window.__uiSmokeSettings) await window.api.settings.save(window.__uiSmokeSettings);
          return true;
        })()`
      )
    } catch {
      /* window may already be closing */
    }
  }
}

async function evaluate(win: BrowserWindow, code: string): Promise<unknown> {
  return win.webContents.executeJavaScript(code)
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  const image = await win.webContents.capturePage()
  await fs.writeFile(path.join(OUT_DIR, name), image.toPNG())
}
