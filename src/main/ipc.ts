import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { motorEditor } from './engine'
import { dirs } from './paths'
import * as proy from './projects'
import { guardarAjustes, leerAjustes, type Ajustes } from './settings'
import { desinstalarMotor, descargarModelos, estadoMotor, instalarMotor } from './setup'

const aTodas = (canal: string, dato: unknown): void => {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(canal, dato)
}

let contadorPrev = 0
const limpio = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()

export function registrarIpc(): void {
  proy.alCambiarProyecto((p) => aTodas('proy:evento', p))

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    plataforma: process.platform,
    arch: process.arch,
    empaquetada: app.isPackaged
  }))

  ipcMain.handle('ajustes:leer', () => leerAjustes())
  ipcMain.handle('ajustes:guardar', (_e, a: Partial<Ajustes>) => guardarAjustes(a))

  ipcMain.handle('motor:estado', (_e, calidad: 'alta' | 'rapida') => estadoMotor(calidad))
  ipcMain.handle('motor:instalar', async (_e, calidad: 'alta' | 'rapida') => {
    try {
      await instalarMotor(calidad, (p) => aTodas('motor:progreso', p))
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message as string }
    }
  })
  ipcMain.handle('motor:modelos', async (_e, calidad: 'alta' | 'rapida') => {
    try {
      await descargarModelos(calidad, (p) => aTodas('motor:progreso', p))
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message as string }
    }
  })
  ipcMain.handle('motor:desinstalar', () => {
    motorEditor().parar()
    desinstalarMotor()
  })

  ipcMain.handle('proy:listar', () => proy.listar())
  ipcMain.handle('proy:crear', (_e, rutas: string[]) => proy.crear(rutas, leerAjustes().calidad))
  ipcMain.handle('proy:elegir', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showOpenDialog(win!, {
      title: 'Elige canciones',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'aif', 'aiff', 'wma', 'mp4', 'mov', 'mkv', 'webm'] }]
    })
    return r.canceled ? [] : proy.crear(r.filePaths, leerAjustes().calidad)
  })
  ipcMain.handle('proy:borrar', (_e, id: string) => proy.borrar(id))
  ipcMain.handle('proy:cancelar', (_e, id: string) => proy.cancelar(id))
  ipcMain.handle('proy:reintentar', (_e, id: string) => {
    try {
      proy.reintentar(id)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message as string }
    }
  })
  ipcMain.handle('proy:renombrar', (_e, id: string, t: string, a: string) => proy.renombrar(id, t, a))

  ipcMain.handle('proy:abrir', async (_e, id: string) => {
    const r = await motorEditor().pedir('open', { proyecto: proy.dirProyecto(id) })
    return r
  })
  ipcMain.handle('proy:cerrar', async () => {
    try {
      await motorEditor().pedir('close')
    } catch {
      /* nada abierto */
    }
  })
  ipcMain.handle('proy:guardar-edicion', (_e, id: string, ed: unknown) => proy.guardarEdicion(id, ed))

  ipcMain.handle('proy:render', async (_e, id: string, edicion: unknown) => {
    const carpeta = join(proy.dirProyecto(id), 'prev')
    mkdirSync(carpeta, { recursive: true })
    const n = ++contadorPrev
    const salida = join(carpeta, `p${Date.now()}_${n}.wav`)
    const info = await motorEditor().pedir('render', { proyecto: proy.dirProyecto(id), edicion, salida })
    try {
      const viejos = readdirSync(carpeta).filter((f) => f.endsWith('.wav')).sort()
      for (const f of viejos.slice(0, Math.max(0, viejos.length - 3))) rmSync(join(carpeta, f), { force: true })
    } catch {
      /* limpieza opcional */
    }
    const nombre = salida.split(/[\\/]/).pop()
    return { ...info, url: `media://p/${id}/prev/${nombre}` }
  })

  ipcMain.handle(
    'proy:exportar',
    async (e, id: string, edicion: unknown, opciones: { formato: 'mp3' | 'wav' | 'flac'; nombre: string; etiquetas: Record<string, string> }) => {
      const aj = leerAjustes()
      const ext = opciones.formato
      const nombre = limpio(opciones.nombre) || 'Extended'
      let destino: string
      if (aj.preguntarDonde) {
        mkdirSync(aj.carpetaSalida, { recursive: true })
        const win = BrowserWindow.fromWebContents(e.sender)
        const r = await dialog.showSaveDialog(win!, {
          title: 'Guardar el extended',
          defaultPath: join(aj.carpetaSalida, `${nombre}.${ext}`),
          filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
        })
        if (r.canceled || !r.filePath) return { cancelado: true }
        destino = r.filePath
      } else {
        mkdirSync(aj.carpetaSalida, { recursive: true })
        destino = join(aj.carpetaSalida, `${nombre}.${ext}`)
        let i = 2
        while (existsSync(destino)) destino = join(aj.carpetaSalida, `${nombre} (${i++}).${ext}`)
      }
      const info = await motorEditor().pedir(
        'export',
        { proyecto: proy.dirProyecto(id), edicion, destino, formato: ext, bits: aj.bits, kbps: aj.kbps, etiquetas: opciones.etiquetas, portada: aj.portada },
        (p) => aTodas('export:progreso', p)
      )
      return { archivo: destino, duracion_s: info.duracion_s }
    }
  )

  ipcMain.handle('sis:mostrar', (_e, ruta: string) => shell.showItemInFolder(ruta))
  ipcMain.handle('sis:carpeta', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showOpenDialog(win!, { title: 'Carpeta de salida', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('sis:almacenamiento', () => {
    const d = dirs()
    const lista = proy.listar()
    return {
      motor: proy.tamanoDir(d.venv) + proy.tamanoDir(d.python),
      modelos: proy.tamanoDir(d.models),
      proyectos: proy.tamanoDir(d.proyectos),
      carpeta: d.root,
      n: lista.length
    }
  })
  ipcMain.handle('sis:abrir-datos', () => shell.openPath(dirs().root))
}
