import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

export type Ajustes = {
  calidad: 'alta' | 'rapida'
  tema: 'sistema' | 'claro' | 'oscuro'
  carpetaSalida: string
  formato: 'mp3' | 'wav' | 'flac'
  kbps: number
  bits: 16 | 24
  patron: string // {titulo} {artista} {bpm}
  preguntarDonde: boolean
}

const PREDETERMINADOS = (): Ajustes => ({
  calidad: 'alta',
  tema: 'sistema',
  carpetaSalida: join(app.getPath('music'), 'Alargo'),
  formato: 'mp3',
  kbps: 320,
  bits: 16,
  patron: '{titulo} (Extended)',
  preguntarDonde: true
})

let cache: Ajustes | null = null
const archivo = () => join(app.getPath('userData'), 'ajustes.json')

export function leerAjustes(): Ajustes {
  if (cache) return cache
  let guardado: Partial<Ajustes> = {}
  try {
    guardado = JSON.parse(readFileSync(archivo(), 'utf8'))
  } catch {
    /* primera vez */
  }
  cache = { ...PREDETERMINADOS(), ...guardado }
  return cache
}

export function guardarAjustes(parcial: Partial<Ajustes>): Ajustes {
  cache = { ...leerAjustes(), ...parcial }
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(archivo(), JSON.stringify(cache, null, 2))
  } catch {
    /* sin permisos: se usa solo en memoria */
  }
  return cache
}
