import { BrowserWindow, type NativeImage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, sleep } from '../utils'

export interface ImageRenderer {
  render(html: string, width: number, height: number, outPath: string): Promise<void>
  dispose?(): void
}

export class ElectronImageRenderer implements ImageRenderer {
  private window: BrowserWindow | null = null
  private queue: Promise<void> = Promise.resolve()

  async render(html: string, width: number, height: number, outPath: string): Promise<void> {
    const run = this.queue.then(() => this.renderNow(html, width, height, outPath))
    this.queue = run.catch(() => undefined)
    return run
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
  }

  private async renderNow(html: string, width: number, height: number, outPath: string): Promise<void> {
    const win = this.ensureWindow()
    win.setContentSize(width, height)
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await win.webContents
      .executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true')
      .catch(() => undefined)
    await sleep(120)
    const image = await this.capture(win)
    await ensureDir(path.dirname(outPath))
    await fs.writeFile(outPath, image.toPNG())
  }

  private async capture(win: BrowserWindow): Promise<NativeImage> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (win.isDestroyed()) throw new Error('渲染窗口已关闭')
      try {
        win.webContents.invalidate()
        const image = await win.webContents.capturePage()
        if (!image.isEmpty()) return image
      } catch (error) {
        lastError = error
      }
      await sleep(180 + attempt * 160)
    }
    throw new Error(
      `无法捕获渲染画面：${lastError instanceof Error ? lastError.message : '空图像'}`
    )
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    this.window = new BrowserWindow({
      show: false,
      frame: false,
      width: 1080,
      height: 1920,
      enableLargerThanScreen: true,
      backgroundColor: '#0b0e14',
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    })
    this.window.webContents.setFrameRate(30)
    return this.window
  }
}
