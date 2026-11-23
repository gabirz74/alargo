import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Motor } from './engine'
import { dirs, modelosDir, motorSrc, pythonDelEntorno, uvPath } from './paths'

export type EstadoMotor = {
  motorListo: boolean
  modelos: Record<string, { listo: boolean; mb: number }> | null
  faltan: string[]
  mbPendientes: number
  instalando: boolean
  error?: string
}

export type ProgresoInstalacion = { fase: string; fraction: number; detalle?: string }

let instalando = false

function hashRequisitos(): string {
  try {
    return createHash('sha1').update(readFileSync(join(motorSrc(), 'requirements.txt'))).digest('hex').slice(0, 12)
  } catch {
    return 'x'
  }
}
const marca = () => join(dirs().venv, '.alargo-ok')

export function motorInstalado(): boolean {
  if (process.env.ALARGO_PYTHON) return existsSync(process.env.ALARGO_PYTHON)
  try {
    return existsSync(pythonDelEntorno()) && readFileSync(marca(), 'utf8').trim() === hashRequisitos()
  } catch {
    return false
  }
}

export async function estadoMotor(calidad: 'alta' | 'rapida'): Promise<EstadoMotor> {
  const base: EstadoMotor = { motorListo: false, modelos: null, faltan: [], mbPendientes: 0, instalando }
  if (!motorInstalado()) {
    base.faltan = ['motor']
    base.mbPendientes = calidad === 'alta' ? 2300 : 1700
    return base
  }
  base.motorListo = true
  const m = new Motor()
  try {
    const r = await m.pedir('models_status', { calidad })
    base.modelos = r.modelos
    base.faltan = r.faltan
    base.mbPendientes = r.mb_pendientes
  } catch (e: any) {
    base.error = e.message
  } finally {
    m.matar()
  }
  return base
}

function ejecutar(
  exe: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  alLinea: (l: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { env, windowsHide: true })
    let cola: string[] = []
    const leer = (b: Buffer): void => {
      for (const l of b.toString().split(/\r?\n|\r/)) {
        if (!l.trim()) continue
        cola.push(l.trim())
        if (cola.length > 30) cola = cola.slice(-30)
        alLinea(l.trim())
      }
    }
    p.stdout.on('data', leer)
    p.stderr.on('data', leer)
    p.on('error', (e) => reject(new Error(`No se pudo ejecutar ${exe}: ${e.message}`)))
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`${exe} terminó con error ${c}\n${cola.slice(-6).join('\n')}`))))
  })
}

export async function instalarMotor(
  calidad: 'alta' | 'rapida',
  enviar: (p: ProgresoInstalacion) => void
): Promise<void> {
  if (instalando) throw new Error('Ya se está instalando')
  instalando = true
  try {
    const d = dirs()
    mkdirSync(d.engine, { recursive: true })
    if (!motorInstalado()) {
      const uv = uvPath()
      const env = {
        ...process.env,
        UV_PYTHON_INSTALL_DIR: d.python,
        UV_LINK_MODE: 'copy',
        UV_NO_PROGRESS: '1',
        UV_PYTHON_DOWNLOADS: 'automatic'
      }
      enviar({ fase: 'Preparando Python', fraction: 0.01 })
      await ejecutar(uv, ['python', 'install', '3.12'], env, (l) => enviar({ fase: 'Preparando Python', fraction: 0.04, detalle: l }))
      enviar({ fase: 'Creando el entorno', fraction: 0.09 })
      rmSync(d.venv, { recursive: true, force: true })
      await ejecutar(uv, ['venv', d.venv, '--python', '3.12', '--managed-python'], env, () => {})
      let descargas = 0
      await ejecutar(
        uv,
        ['pip', 'install', '--python', pythonDelEntorno(), '--no-cache', '-r', join(motorSrc(), 'requirements.txt')],
        env,
        (l) => {
          if (/^(Downloading|Building|Prepared|Installed|\+)/.test(l) || /Downloading/.test(l)) descargas++
          const f = 0.1 + 0.4 * (1 - Math.exp(-descargas / 14))
          enviar({ fase: 'Instalando los componentes de audio', fraction: f, detalle: l.slice(0, 90) })
        }
      )
      writeFileSync(marca(), hashRequisitos())
    }
    await descargarModelos(calidad, (p) => enviar({ ...p, fraction: 0.5 + 0.5 * p.fraction }))
    enviar({ fase: 'Listo', fraction: 1 })
  } finally {
    instalando = false
  }
}

export async function descargarModelos(
  calidad: 'alta' | 'rapida',
  enviar: (p: ProgresoInstalacion) => void
): Promise<void> {
  mkdirSync(modelosDir(), { recursive: true })
  const m = new Motor()
  try {
    await m.pedir('models_download', { calidad }, (p) => enviar({ fase: p.stage, fraction: p.fraction }))
  } finally {
    m.parar()
  }
}

export function desinstalarMotor(): void {
  const d = dirs()
  rmSync(d.venv, { recursive: true, force: true })
  rmSync(d.python, { recursive: true, force: true })
  rmSync(d.models, { recursive: true, force: true })
}
