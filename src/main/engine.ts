import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { dirs, modelosDir, motorSrc, pythonDelEntorno } from './paths'

export type Progreso = { stage: string; fraction: number; message?: string | null }

type Pendiente = {
  resolve: (v: any) => void
  reject: (e: Error) => void
  onProgress?: (p: Progreso) => void
}

let logStream: WriteStream | null = null
function log(texto: string): void {
  try {
    if (!logStream) {
      mkdirSync(dirs().logs, { recursive: true })
      logStream = createWriteStream(join(dirs().logs, 'motor.log'), { flags: 'a' })
    }
    logStream.write(texto)
  } catch {
    /* el registro es opcional */
  }
}

/** Un proceso Python del motor (alargo_engine) con el que se habla por JSON-lines. */
export class Motor {
  private proc: ChildProcessWithoutNullStreams | null = null
  private pendientes = new Map<number, Pendiente>()
  private siguiente = 1
  private listo: Promise<void> | null = null
  private cola: string[] = []

  private arrancar(): Promise<void> {
    if (this.listo) return this.listo
    this.listo = new Promise<void>((resolve, reject) => {
      const py = pythonDelEntorno()
      const src = motorSrc()
      const env = {
        ...process.env,
        PYTHONPATH: src,
        PYTHONUNBUFFERED: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONUTF8: '1',
        ALARGO_MODELS: modelosDir()
      }
      const p = spawn(py, ['-X', 'utf8', '-u', '-m', 'alargo_engine'], { cwd: src, env, windowsHide: true })
      this.proc = p
      let vivo = false
      p.on('error', (e) => {
        this.listo = null
        this.proc = null
        reject(new Error('No se pudo iniciar el motor: ' + e.message))
        this.fallar(new Error('El motor no está disponible'))
      })
      p.on('exit', (code) => {
        const eraVivo = vivo
        this.proc = null
        this.listo = null
        if (!eraVivo) reject(new Error('El motor se cerró al arrancar (' + code + ')\n' + this.cola.slice(-8).join('\n')))
        this.fallar(new Error('El motor se detuvo (código ' + code + '). ' + this.cola.slice(-3).join(' ')))
      })
      p.stderr.on('data', (b: Buffer) => {
        const t = b.toString()
        log(t)
        for (const l of t.split(/\r?\n/)) if (l.trim()) this.cola.push(l.trim())
        if (this.cola.length > 60) this.cola.splice(0, this.cola.length - 60)
      })
      const rl = createInterface({ input: p.stdout })
      rl.on('line', (linea) => {
        let m: any
        try {
          m = JSON.parse(linea)
        } catch {
          return
        }
        if (m.event === 'ready') {
          vivo = true
          resolve()
          return
        }
        const pend = this.pendientes.get(m.id)
        if (!pend) return
        if (m.event === 'progress') pend.onProgress?.({ stage: m.stage, fraction: m.fraction, message: m.message })
        else if (m.event === 'result') {
          this.pendientes.delete(m.id)
          pend.resolve(m.data)
        } else if (m.event === 'error') {
          this.pendientes.delete(m.id)
          pend.reject(new Error(m.message || 'Error del motor'))
        }
      })
    })
    return this.listo
  }

  private fallar(e: Error): void {
    for (const [, p] of this.pendientes) p.reject(e)
    this.pendientes.clear()
  }

  async pedir<T = any>(cmd: string, args: Record<string, unknown> = {}, onProgress?: (p: Progreso) => void): Promise<T> {
    await this.arrancar()
    const id = this.siguiente++
    return new Promise<T>((resolve, reject) => {
      this.pendientes.set(id, { resolve, reject, onProgress })
      this.proc?.stdin.write(JSON.stringify({ id, cmd, args }) + '\n')
    })
  }

  parar(): void {
    this.fallar(new Error('Cancelado'))
    const p = this.proc
    this.proc = null
    this.listo = null
    if (p) {
      try {
        p.stdin.write(JSON.stringify({ cmd: 'quit' }) + '\n')
      } catch {
        /* ya cerrado */
      }
      setTimeout(() => p.kill(), 800)
    }
  }

  matar(): void {
    this.fallar(new Error('Cancelado'))
    this.proc?.kill()
    this.proc = null
    this.listo = null
  }
}

/** Motor compartido para abrir proyectos, previsualizar y exportar. */
let editor: Motor | null = null
export function motorEditor(): Motor {
  if (!editor) editor = new Motor()
  return editor
}
export function pararMotores(): void {
  editor?.parar()
}
