import type { Analisis, Picos, PicosCrudos } from './types'

export function decodificarPicos(p: PicosCrudos): Picos {
  const bin = atob(p.datos)
  const datos = new Int8Array(bin.length)
  for (let i = 0; i < bin.length; i++) datos[i] = (bin.charCodeAt(i) << 24) >> 24
  return { pps: p.pps, n: p.n, escala: p.escala, datos }
}

export function fmt(s: number, dec = false): string {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${(dec ? r.toFixed(1) : Math.floor(r).toString()).padStart(dec ? 4 : 2, '0')}`
}

export function fmtMB(bytes: number): string {
  if (bytes > 1e9) return (bytes / 1e9).toFixed(1).replace('.', ',') + ' GB'
  return Math.max(1, Math.round(bytes / 1e6)) + ' MB'
}

/** m:ss.mmm (precisión de milisegundo) */
export function fmtMs(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r.toFixed(3).padStart(6, '0')}`
}

/** Acepta «1:23.456», «83,5» o «83.5» y devuelve segundos (o null si no se entiende). */
export function leerTiempo(txt: string): number | null {
  const t = txt.trim().replace(',', '.')
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t)
  if (!m) return null
  return (m[1] ? parseInt(m[1], 10) * 60 : 0) + parseFloat(m[2])
}

type Rango = { ini_s: number; fin_s: number }
/** Tiempo que se ve en el resultado -> tiempo del resultado sin cortes (los cortes se guardan sin cortes). */
export function aBruto(d: number, cs: Rango[]): number {
  let u = d
  for (const c of cs) {
    if (u >= c.ini_s - 1e-9) u += c.fin_s - c.ini_s
    else break
  }
  return u
}
/** Tiempo sin cortes -> tiempo que se ve en el resultado. */
export function aPantalla(u: number, cs: Rango[]): number {
  let d = u
  for (const c of cs) {
    if (u >= c.fin_s) d -= c.fin_s - c.ini_s
    else if (u > c.ini_s) d -= u - c.ini_s
  }
  return d
}

export const T4 = (an: Analisis): number => 4 * an.grid.T

/** Compás (índice entero relativo a la rejilla) más cercano a `t`. */
export const barK = (an: Analisis, t: number): number => Math.round((t - an.grid.t0) / T4(an))
export const barTime = (an: Analisis, k: number): number => an.grid.t0 + k * T4(an)
export const snapBar = (an: Analisis, t: number): number => barTime(an, barK(an, t))
/** Número de compás que ve el usuario (1 = primer compás completo). */
export const barNumber = (an: Analisis, k: number): number => k - an.j0 + 1

export const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x))

export const NOMBRE_AVISO: Record<string, string> = {
  intro_corta: 'La intro tiene menos de 28 tiempos de ritmo antes de la voz.',
  fx_salida_sin_acapela: 'Los efectos de salida necesitan la acapela final activada.',
  trozo_se_sale: 'El trozo elegido para la intro se sale del final de la canción: la parte que falta sonará en silencio.',
  acapela_recortada: 'La acapela es más corta de lo pedido: no queda más canción.'
}

/** Une y ordena los cortes igual que el motor (por si se solapan). */
export function normalizarCortes(c: { ini_s: number; fin_s: number }[]): { ini_s: number; fin_s: number }[] {
  const ord = c.filter((x) => x.fin_s - x.ini_s > 0.02).map((x) => ({ ...x })).sort((a, b) => a.ini_s - b.ini_s)
  const out: { ini_s: number; fin_s: number }[] = []
  for (const x of ord) {
    const u = out[out.length - 1]
    if (u && x.ini_s <= u.fin_s + 0.01) u.fin_s = Math.max(u.fin_s, x.fin_s)
    else out.push(x)
  }
  return out
}
