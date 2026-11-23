import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { Motor } from './engine'
import { dirs } from './paths'

export type Proyecto = {
  id: string
  titulo: string
  artista: string
  archivo: string
  creado: string
  calidad: 'alta' | 'rapida'
  duracion_s?: number
  bpm?: number
  portada?: boolean
  estado: 'en_cola' | 'analizando' | 'listo' | 'error'
  error?: string
  progreso?: number
  etapa?: string
  inicio?: number
}

type Oyente = (p: Proyecto) => void
const oyentes = new Set<Oyente>()
export function alCambiarProyecto(f: Oyente): () => void {
  oyentes.add(f)
  return () => oyentes.delete(f)
}
const avisar = (p: Proyecto): void => oyentes.forEach((f) => f(p))

export const dirProyecto = (id: string): string => join(dirs().proyectos, id)
const archivoMeta = (id: string): string => join(dirProyecto(id), 'proyecto.json')

function leerMeta(id: string): Proyecto | null {
  try {
    return JSON.parse(readFileSync(archivoMeta(id), 'utf8'))
  } catch {
    return null
  }
}
function escribirMeta(p: Proyecto): void {
  const { progreso: _p, etapa: _e, inicio: _i, ...resto } = p
  writeFileSync(archivoMeta(p.id), JSON.stringify(resto, null, 1))
}

const enMemoria = new Map<string, Proyecto>() // estado vivo (progreso) de los que se están analizando

export function listar(): Proyecto[] {
  const raiz = dirs().proyectos
  if (!existsSync(raiz)) return []
  const out: Proyecto[] = []
  for (const id of readdirSync(raiz)) {
    const vivo = enMemoria.get(id)
    if (vivo) {
      out.push(vivo)
      continue
    }
    const m = leerMeta(id)
    if (!m) continue
    if (m.estado === 'en_cola' || m.estado === 'analizando') {
      m.estado = 'error'
      m.error = 'El análisis se interrumpió al cerrar la app'
    }
    out.push(m)
  }
  return out.sort((a, b) => (a.creado < b.creado ? 1 : -1))
}

function nuevoId(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(16).slice(2, 6)}`
}

const EXT = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.aif', '.aiff', '.wma', '.mp4', '.mov', '.mkv', '.webm'])
export const esAudio = (f: string): boolean => EXT.has(extname(f).toLowerCase())

export function crear(rutas: string[], calidad: 'alta' | 'rapida'): Proyecto[] {
  const creados: Proyecto[] = []
  for (const ruta of rutas) {
    if (!esAudio(ruta) || !existsSync(ruta)) continue
    const id = nuevoId()
    mkdirSync(dirProyecto(id), { recursive: true })
    const nombre = basename(ruta, extname(ruta))
    const [artista, titulo] = nombre.includes(' - ') ? [nombre.split(' - ')[0], nombre.split(' - ').slice(1).join(' - ')] : ['', nombre]
    const p: Proyecto = { id, titulo, artista, archivo: ruta, creado: new Date().toISOString(), calidad, estado: 'en_cola', progreso: 0 }
    escribirMeta(p)
    enMemoria.set(id, p)
    cola.push(id)
    creados.push(p)
    avisar(p)
  }
  void siguiente()
  return creados
}

const cola: string[] = []
let corriendo: { id: string; motor: Motor } | null = null

async function siguiente(): Promise<void> {
  if (corriendo) return
  const id = cola.shift()
  if (!id) return
  const p = enMemoria.get(id)
  if (!p) return void siguiente()
  const motor = new Motor()
  corriendo = { id, motor }
  p.estado = 'analizando'
  p.inicio = Date.now()
  avisar(p)
  try {
    const r = await motor.pedir('analyze', { proyecto: dirProyecto(id), entrada: p.archivo, calidad: p.calidad }, (pr) => {
      p.progreso = pr.fraction
      p.etapa = pr.stage
      avisar(p)
    })
    const meta = r.proyecto as Proyecto
    Object.assign(p, meta, { estado: 'listo' as const, progreso: 1, error: undefined })
    escribirMeta(p)
    enMemoria.delete(id)
    avisar({ ...p })
  } catch (e: any) {
    p.estado = 'error'
    p.error = e.message === 'Cancelado' ? 'Análisis cancelado' : e.message
    escribirMeta(p)
    enMemoria.delete(id)
    avisar({ ...p })
  } finally {
    motor.parar()
    corriendo = null
    void siguiente()
  }
}

export function cancelar(id: string): void {
  const i = cola.indexOf(id)
  if (i >= 0) {
    cola.splice(i, 1)
    borrar(id)
    return
  }
  if (corriendo?.id === id) corriendo.motor.matar()
}

export function reintentar(id: string): void {
  const m = leerMeta(id)
  if (!m || !existsSync(m.archivo)) throw new Error('No se encuentra el archivo original: ' + (m?.archivo ?? id))
  const p: Proyecto = { ...m, estado: 'en_cola', error: undefined, progreso: 0 }
  enMemoria.set(id, p)
  cola.push(id)
  avisar(p)
  void siguiente()
}

export function borrar(id: string): void {
  if (corriendo?.id === id) corriendo.motor.matar()
  enMemoria.delete(id)
  rmSync(dirProyecto(id), { recursive: true, force: true })
  avisar({ id, estado: 'error', titulo: '', artista: '', archivo: '', creado: '', calidad: 'alta', error: '__borrado__' })
}

export function renombrar(id: string, titulo: string, artista: string): void {
  const m = leerMeta(id)
  if (!m) return
  escribirMeta({ ...m, titulo, artista })
  avisar({ ...m, titulo, artista })
}

export function leerEdicion(id: string): any {
  try {
    return JSON.parse(readFileSync(join(dirProyecto(id), 'edicion.json'), 'utf8'))
  } catch {
    return null
  }
}
export function guardarEdicion(id: string, ed: unknown): void {
  writeFileSync(join(dirProyecto(id), 'edicion.json'), JSON.stringify(ed))
}

export function tamanoDir(ruta: string): number {
  let total = 0
  const pila = [ruta]
  while (pila.length) {
    const d = pila.pop() as string
    let ents: string[]
    try {
      ents = readdirSync(d)
    } catch {
      continue
    }
    for (const e of ents) {
      const f = join(d, e)
      try {
        const s = statSync(f)
        if (s.isDirectory()) pila.push(f)
        else total += s.size
      } catch {
        /* se ignora */
      }
    }
  }
  return total
}
