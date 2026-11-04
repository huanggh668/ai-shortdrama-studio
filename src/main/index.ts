import { app, BrowserWindow, Menu, protocol, shell, type MenuItemConstructorOptions } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { AppEvent } from '../shared/types'
import { ASSET_PROTOCOL, IPC } from '../shared/ipc'
import { createServices, type AppServices } from './bootstrap'
import { registerIpc } from './ipc'
import { runSmokeTest } from './smoke'
import { runUiSmoke } from './uiSmoke'

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const isDev = !app.isPackaged
const smokeMode = process.argv.includes('--smoke-test')
const uiSmokeMode = process.argv.includes('--ui-smoke')
let mainWindow: BrowserWindow | null = null
let services: AppServices | null = null

function broadcast(event: AppEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.event, event)
  }
}

function createWindow(onReady?: () => void): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#0b0e14',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay:
      process.platform === 'win32'
        ? { color: '#0b0e14', symbolColor: '#9aa4b2', height: 44 }
        : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    onReady?.()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === mainWindow?.webContents.getURL()) return
    event.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        ...(isDev ? [{ role: 'toggleDevTools' as const }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [{ role: 'minimize' }, { role: 'close' }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerAssetProtocol(appServices: AppServices): void {
  protocol.handle(ASSET_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const projectId = decodeURIComponent(url.hostname)
      let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      if (!relative.startsWith('assets/')) return new Response('forbidden', { status: 403 })
      relative = relative.slice('assets/'.length)
      const file = appServices.store.assetPath(projectId, relative)
      const data = await fs.readFile(file)
      return new Response(new Uint8Array(data), {
        headers: { 'Content-Type': mimeType(file), 'Cache-Control': 'no-cache' }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

function mimeType(file: string): string {
  const ext = path.extname(file).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.srt': 'text/plain; charset=utf-8',
    '.ass': 'text/plain; charset=utf-8'
  }
  return map[ext] ?? 'application/octet-stream'
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('com.dramaforge.studio')

    if (smokeMode) {
      const code = await runSmokeTest()
      app.exit(code)
      return
    }

    services = createServices(broadcast)
    await services.init()
    registerAssetProtocol(services)
    registerIpc(services)
    buildMenu()
    createWindow(() => {
      if (uiSmokeMode && mainWindow) {
        void runUiSmoke(mainWindow).then((code) => app.exit(code))
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    services?.dispose()
  })
}
