import { app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export function raiz(): string {
  return app.getPath('userData')
}
export const dirs = () => {
  const root = raiz()
  const engine = join(root, 'engine')
  return {
    root,
    engine,
    python: join(engine, 'python'),
    venv: join(engine, 'venv'),
    models: join(engine, 'models'),
    proyectos: join(root, 'proyectos'),
    logs: join(root, 'logs')
  }
}

/** Carpeta con el código Python del motor (en desarrollo, la del repositorio). */
export function motorSrc(): string {
  return app.isPackaged ? join(process.resourcesPath, 'engine') : join(app.getAppPath(), 'engine')
}

export function pythonDelEntorno(): string {
  if (process.env.ALARGO_PYTHON) return process.env.ALARGO_PYTHON
  const v = dirs().venv
  return process.platform === 'win32' ? join(v, 'Scripts', 'python.exe') : join(v, 'bin', 'python')
}

export function modelosDir(): string {
  return process.env.ALARGO_MODELS || dirs().models
}

/** El instalador de paquetes `uv` que se empaqueta con la app (o el del sistema en desarrollo). */
export function uvPath(): string {
  if (process.env.ALARGO_UV) return process.env.ALARGO_UV
  const exe = process.platform === 'win32' ? 'uv.exe' : 'uv'
  const empaquetado = app.isPackaged
    ? join(process.resourcesPath, 'uv', exe)
    : join(app.getAppPath(), 'resources', 'uv', exe)
  return existsSync(empaquetado) ? empaquetado : 'uv'
}
