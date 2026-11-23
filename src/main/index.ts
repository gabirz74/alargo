import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { registrarIpc } from './ipc'
import { registrarEsquema, servirMedia } from './media'
import { pararMotores } from './engine'
import { motorSrc, uvPath } from './paths'
import { leerAjustes } from './settings'

if (process.env.ALARGO_HOME) app.setPath('userData', process.env.ALARGO_HOME)
app.setName('Alargo')
registrarEsquema()

const autoprueba = process.argv.includes('--self-test')
const unica = autoprueba ? true : app.requestSingleInstanceLock()
if (!unica) app.quit()

function crearVentana(): BrowserWindow {
  const mac = process.platform === 'darwin'
  const oscuro = nativeTheme.shouldUseDarkColors
  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    backgroundColor: oscuro ? '#0f1013' : '#f4f5f7',
    title: 'Alargo',
    titleBarStyle: mac ? 'hiddenInset' : 'default',
    trafficLightPosition: mac ? { x: 18, y: 18 } : undefined,
    autoHideMenuBar: !mac,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) e.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function menu(): void {
  const mac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(mac ? [{ role: 'appMenu' as const }] : []),
      { role: 'editMenu' as const },
      { role: 'viewMenu' as const },
      { role: 'windowMenu' as const }
    ])
  )
}

async function pruebaAutomatica(win: BrowserWindow): Promise<void> {
  const res: Record<string, unknown> = {}
  try {
    await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()))
    await new Promise((r) => setTimeout(r, 1500))
    res.api = await win.webContents.executeJavaScript('typeof window.api === "object" && typeof window.api.proyectos.listar === "function"')
    res.interfaz = await win.webContents.executeJavaScript('document.getElementById("root") && document.getElementById("root").children.length > 0')
    res.motorSrc = existsSync(join(motorSrc(), 'alargo_engine', 'server.py'))
    res.requisitos = existsSync(join(motorSrc(), 'requirements.txt'))
    try {
      res.uv = execFileSync(uvPath(), ['--version'], { timeout: 15000 }).toString().trim()
    } catch (e: any) {
      res.uv = 'ERROR ' + e.message
    }
    res.ajustes = typeof leerAjustes().calidad === 'string'
  } catch (e: any) {
    res.error = e.message
  }
  const ok = res.api === true && res.interfaz === true && res.motorSrc === true && res.requisitos === true && typeof res.uv === 'string' && !(res.uv as string).startsWith('ERROR') && res.ajustes === true && !res.error
  console.log('SELF-TEST ' + JSON.stringify(res))
  console.log(ok ? 'SELF-TEST OK' : 'SELF-TEST FALLO')
  app.exit(ok ? 0 : 1)
}

if (unica) {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })
  void app.whenReady().then(() => {
    servirMedia()
    registrarIpc()
    menu()
    const win = crearVentana()
    if (autoprueba) void pruebaAutomatica(win)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) crearVentana()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', () => pararMotores())
}
