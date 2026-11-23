import { protocol } from 'electron'
import { createReadStream, statSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import { dirs } from './paths'

const TIPOS: Record<string, string> = { '.wav': 'audio/wav', '.flac': 'audio/flac', '.mp3': 'audio/mpeg' }

export function registrarEsquema(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false } }
  ])
}

/** media://p/<id>/prev/p1.wav  ->  <proyectos>/<id>/prev/p1.wav  (solo prev/ y pistas/, con soporte de Range). */
export function servirMedia(): void {
  protocol.handle('media', (req) => {
    try {
      const u = new URL(req.url)
      const partes = decodeURIComponent(u.pathname).split('/').filter(Boolean)
      const [id, carpeta, ...resto] = partes
      if (!id || !['prev', 'pistas'].includes(carpeta) || !resto.length) return new Response('No permitido', { status: 403 })
      const base = normalize(join(dirs().proyectos, id))
      const ruta = normalize(join(base, carpeta, ...resto))
      if (!ruta.startsWith(base + sep)) return new Response('No permitido', { status: 403 })
      const ext = ruta.slice(ruta.lastIndexOf('.')).toLowerCase()
      const total = statSync(ruta).size
      const rango = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '')
      const cab: Record<string, string> = { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
      if (rango) {
        const ini = rango[1] ? parseInt(rango[1], 10) : 0
        const fin = rango[2] ? Math.min(parseInt(rango[2], 10), total - 1) : total - 1
        const flujo = Readable.toWeb(createReadStream(ruta, { start: ini, end: fin })) as unknown as ReadableStream
        return new Response(flujo, { status: 206, headers: { ...cab, 'Content-Range': `bytes ${ini}-${fin}/${total}`, 'Content-Length': String(fin - ini + 1) } })
      }
      const flujo = Readable.toWeb(createReadStream(ruta)) as unknown as ReadableStream
      return new Response(flujo, { status: 200, headers: { ...cab, 'Content-Length': String(total) } })
    } catch {
      return new Response('No encontrado', { status: 404 })
    }
  })
}
