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
  acapela_recortada: 'La acapela es más corta de lo pedido: no queda más canción.'
}
