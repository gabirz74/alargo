import { useEffect, useRef, useState } from 'react'
import { audio } from './audio'
import { ponerArrastre, useStore } from './store'
import type { Picos } from './types'
import { barK, barNumber, barTime, clamp, fmt, snapBar, T4 } from './util'

const PADL = 16
const RULER = 26
const A_Y = RULER
const A_H = 132
const B_Y = A_Y + A_H + 30
const B_H = 100
const TOTAL = B_Y + B_H + 26

type Hit = { tipo: 'R' | 'intro' | 'ac' | 'acFin'; x0: number; x1: number; y0: number; y1: number }
type Colores = Record<'surface' | 'sunken' | 'ink' | 'soft' | 'faint' | 'line' | 'accent' | 'graphite' | 'inst', string>

let cacheColores: { tema: string; c: Colores } | null = null
function colores(): Colores {
  const tema = document.documentElement.dataset.theme ?? 'light'
  if (cacheColores?.tema === tema) return cacheColores.c
  const cs = getComputedStyle(document.documentElement)
  const g = (n: string): string => cs.getPropertyValue('--' + n).trim()
  const c = { surface: g('surface'), sunken: g('sunken'), ink: g('ink'), soft: g('soft'), faint: g('faint'), line: g('line'), accent: g('accent'), graphite: g('graphite'), inst: g('inst') }
  cacheColores = { tema, c }
  return c
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Elige la variante de texto que cabe en `ancho` píxeles (o ninguna). */
function ajustarTexto(ctx: CanvasRenderingContext2D, variantes: string[], ancho: number): string | null {
  for (const v of variantes) if (ctx.measureText(v).width <= ancho) return v
  return null
}

function columnas(ctx: CanvasRenderingContext2D, p: Picos, tIni: number, pps: number, W: number, cy: number, amp: number, color: string, alfa = 1): void {
  ctx.fillStyle = color
  ctx.globalAlpha = alfa
  const k = p.pps
  for (let x = 0; x < W; x++) {
    const t0 = tIni + x / pps
    const t1 = tIni + (x + 1) / pps
    let i0 = Math.floor(t0 * k)
    let i1 = Math.max(i0 + 1, Math.ceil(t1 * k))
    if (i1 <= 0 || i0 >= p.n) continue
    i0 = Math.max(0, i0)
    i1 = Math.min(p.n, i1)
    let mn = 127
    let mx = -127
    for (let i = i0; i < i1; i++) {
      const a = p.datos[2 * i]
      const b = p.datos[2 * i + 1]
      if (a < mn) mn = a
      if (b > mx) mx = b
    }
    const y1 = cy - (mx / 127) * amp
    const y2 = cy - (mn / 127) * amp
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
  }
  ctx.globalAlpha = 1
}

export function Timeline(): JSX.Element {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const scRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(900)
  const sucio = useRef(true)
  const hits = useRef<Hit[]>([])
  const arrastre = useRef<null | { tipo: Hit['tipo']; grab: number }>(null)
  const scrollRef = useRef(0)
  const [cursor, setCursor] = useState('default')

  const abierto = useStore((s) => s.abierto)
  const preview = useStore((s) => s.preview)
  const zoomSel = useStore((s) => s.zoom)
  const setZoom = useStore((s) => s.setZoom)

  const an = abierto?.analisis
  const dur = an?.duracion_s ?? 1
  const durB = preview.info?.duracion_s ?? 0
  const maxDur = Math.max(dur, durB)
  const fit = Math.max(2, (W - 2 * PADL) / maxDur)
  const pps = zoomSel > 0 ? Math.max(fit, zoomSel) : fit
  const contenidoW = maxDur * pps + 2 * PADL

  // referencia al último estado para el bucle de dibujo
  const est = useRef({ abierto, preview, pps, W })
  est.current = { abierto, preview, pps, W }
  useEffect(() => {
    sucio.current = true
  }, [abierto, preview, pps, W])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(300, Math.floor(el.clientWidth))))
    ro.observe(el)
    setW(Math.max(300, Math.floor(el.clientWidth)))
    return () => ro.disconnect()
  }, [])

  // ------------------------------------------------------------------ dibujo
  useEffect(() => {
    let raf = 0
    const bucle = (): void => {
      raf = requestAnimationFrame(bucle)
      const sonando = audio.sonando
      if (!sucio.current && !sonando) return
      sucio.current = false
      const cv = cvRef.current
      const { abierto: ab, preview: pv, pps: z, W: ancho } = est.current
      if (!cv || !ab) return
      // seguir el cursor de reproducción
      const sc = scRef.current
      if (sonando && sc) {
        const x = audio.tiempo * z + PADL - sc.scrollLeft
        if (x > ancho - 30 || x < 0) sc.scrollLeft = Math.max(0, audio.tiempo * z - 80)
      }
      const dpr = window.devicePixelRatio || 1
      if (cv.width !== Math.round(ancho * dpr) || cv.height !== Math.round(TOTAL * dpr)) {
        cv.width = Math.round(ancho * dpr)
        cv.height = Math.round(TOTAL * dpr)
      }
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      pintar(ctx, ancho, z, scrollRef.current, ab, pv, hits.current)
    }
    raf = requestAnimationFrame(bucle)
    return () => cancelAnimationFrame(raf)
  }, [])

  function pintar(ctx: CanvasRenderingContext2D, ancho: number, z: number, scroll: number, ab: NonNullable<typeof abierto>, pv: typeof preview, lista: Hit[]): void {
    const C = colores()
    const a = ab.analisis
    const e = ab.edicion
    const t4 = T4(a)
    const X = (t: number): number => t * z + PADL - scroll
    const tIni = (scroll - PADL) / z
    const tFin = tIni + ancho / z
    lista.length = 0
    ctx.clearRect(0, 0, ancho, TOTAL)
    ctx.font = '500 12px "Bricolage Grotesque Variable", system-ui, sans-serif'
    ctx.textBaseline = 'middle'

    // ---- regla de tiempo
    const pasos = [1, 2, 5, 10, 15, 30, 60, 120, 300]
    const paso = pasos.find((p) => p * z >= 72) ?? 300
    ctx.fillStyle = C.faint
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1
    for (let t = Math.max(0, Math.ceil(tIni / paso) * paso); t <= tFin; t += paso) {
      const x = Math.round(X(t)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, RULER - 7)
      ctx.lineTo(x, RULER - 2)
      ctx.stroke()
      ctx.fillText(fmt(t), x + 4, RULER - 12)
    }

    // ---- carril A: canción original
    rr(ctx, 0, A_Y, ancho, A_H, 16)
    ctx.fillStyle = C.surface
    ctx.fill()
    ctx.save()
    rr(ctx, 0, A_Y, ancho, A_H, 16)
    ctx.clip()
    const cyA = A_Y + 28 + (A_H - 36) / 2
    const ampA = (A_H - 40) / 2
    // compases
    const kIni = Math.ceil((tIni - a.grid.t0) / t4)
    const kFin = Math.floor((tFin - a.grid.t0) / t4)
    const pxBar = t4 * z
    ctx.lineWidth = 1
    for (let k = kIni; k <= kFin; k++) {
      const n = barNumber(a, k)
      const fuerte = (((n - 1) % 8) + 8) % 8 === 0
      if (!fuerte && pxBar < 7) continue
      const x = Math.round(X(barTime(a, k))) + 0.5
      ctx.strokeStyle = C.line
      ctx.globalAlpha = fuerte ? 1 : 0.55
      ctx.beginPath()
      ctx.moveTo(x, A_Y + 24)
      ctx.lineTo(x, A_Y + A_H)
      ctx.stroke()
      ctx.globalAlpha = 1
      if (fuerte && pxBar * 8 > 60 && n >= 1) {
        ctx.fillStyle = C.faint
        ctx.fillText(String(n), x + 4, A_Y + 40)
      }
    }
    // forma de onda: instrumental (gris) y voz (acento)
    columnas(ctx, ab.picos.inst, tIni, z, ancho, cyA + 6, ampA, C.inst, 0.9)
    columnas(ctx, ab.picos.voz, tIni, z, ancho, cyA + 6, ampA, C.accent, 0.95)
    // entradas de voz detectadas
    ctx.fillStyle = C.faint
    for (const [t] of a.entradas_voz) {
      const x = X(t)
      if (x > -4 && x < ancho + 4) ctx.fillRect(x - 0.5, A_Y + A_H - 7, 1.5, 5)
    }
    // intro
    if (e.intro.enabled) {
      const td = e.intro.start_s
      const x0 = X(td)
      const x1 = X(td + e.intro.bars * t4)
      ctx.fillStyle = C.graphite
      ctx.globalAlpha = 0.12
      ctx.fillRect(x0, A_Y, x1 - x0, A_H)
      ctx.globalAlpha = 1
      ctx.fillStyle = C.graphite
      rr(ctx, x0, A_Y + 4, Math.max(8, x1 - x0), 20, 6)
      ctx.fill()
      ctx.fillStyle = C.surface
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, A_Y, Math.max(8, x1 - x0), 30)
      ctx.clip()
      const tIn = ajustarTexto(ctx, [`Intro · ${e.intro.bars} compases`, 'Intro'], x1 - x0 - 16)
      if (tIn) ctx.fillText(tIn, x0 + 9, A_Y + 14.5)
      ctx.restore()
      lista.push({ tipo: 'intro', x0, x1, y0: A_Y, y1: A_Y + 26 })
    }
    // acapela
    if (e.acapela.enabled && e.acapela.start_s !== null) {
      const tc = e.acapela.start_s
      const x0 = X(tc)
      const x1 = X(tc + e.acapela.bars * t4)
      ctx.fillStyle = C.accent
      ctx.globalAlpha = 0.13
      ctx.fillRect(x0, A_Y, x1 - x0, A_H)
      ctx.globalAlpha = 1
      ctx.fillStyle = C.accent
      rr(ctx, x0, A_Y + 4, Math.max(8, x1 - x0), 20, 6)
      ctx.fill()
      ctx.fillStyle = C.surface
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, A_Y, Math.max(8, x1 - x0), 30)
      ctx.clip()
      const tAc = ajustarTexto(ctx, [`Acapela · ${e.acapela.bars} compases`, 'Acapela'], x1 - x0 - 16)
      if (tAc) ctx.fillText(tAc, x0 + 9, A_Y + 14.5)
      ctx.restore()
      ctx.fillStyle = C.accent
      rr(ctx, x1 - 3, A_Y + 40, 5, A_H - 80, 3)
      ctx.fill()
      lista.push({ tipo: 'ac', x0, x1, y0: A_Y, y1: A_Y + 26 })
      lista.push({ tipo: 'acFin', x0: x1 - 7, x1: x1 + 7, y0: A_Y + 26, y1: A_Y + A_H })
    }
    // retoma de la canción (donde entra la voz)
    {
      const x = Math.round(X(e.song.start_s)) + 0.5
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, A_Y + 26)
      ctx.lineTo(x, A_Y + A_H)
      ctx.stroke()
      ctx.fillStyle = C.ink
      ctx.beginPath()
      ctx.moveTo(x - 5, A_Y + 26)
      ctx.lineTo(x + 5, A_Y + 26)
      ctx.lineTo(x, A_Y + 33)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = C.soft
      ctx.fillText('Entra la voz', x + 7, A_Y + A_H - 12)
      lista.unshift({ tipo: 'R', x0: x - 7, x1: x + 7, y0: A_Y + 26, y1: A_Y + A_H })
    }
    ctx.restore()
    // nombre del carril (fijo)
    ctx.fillStyle = C.soft
    ctx.fillText('Canción original', PADL, A_Y + A_H + 15)
    // cursor del original
    if (audio.modo === 'original') {
      const x = X(audio.tiempo)
      ctx.fillStyle = C.ink
      ctx.fillRect(x - 0.5, A_Y, 1.5, A_H)
    }

    // ---- carril B: resultado
    rr(ctx, 0, B_Y, ancho, B_H, 16)
    ctx.fillStyle = C.surface
    ctx.fill()
    ctx.save()
    rr(ctx, 0, B_Y, ancho, B_H, 16)
    ctx.clip()
    const info = pv.info
    if (info && pv.picos) {
      const cy = B_Y + 26 + (B_H - 30) / 2
      const amp = (B_H - 34) / 2
      for (const s of info.segmentos) {
        const x0 = X(s.ini)
        const x1 = X(s.fin)
        if (x1 < 0 || x0 > ancho) continue
        const col = s.tipo === 'acapela' ? C.accent : s.tipo === 'intro' ? C.graphite : C.faint
        ctx.fillStyle = col
        ctx.globalAlpha = s.tipo === 'cancion' ? 0.05 : 0.1
        ctx.fillRect(x0, B_Y, x1 - x0, B_H)
        ctx.globalAlpha = 1
        // trozo de onda de este segmento
        ctx.save()
        ctx.beginPath()
        ctx.rect(Math.max(0, x0), B_Y, Math.min(ancho, x1) - Math.max(0, x0), B_H)
        ctx.clip()
        columnas(ctx, pv.picos, tIni, z, ancho, cy, amp, col, s.tipo === 'cancion' ? 0.85 : 1)
        ctx.restore()
        ctx.fillStyle = C.soft
        const nb = String(Math.round(((s.fin - s.ini) / t4) * 10) / 10).replace('.', ',')
        const etiqueta = ajustarTexto(ctx, s.tipo === 'intro' ? [`Intro · ${nb} compases`, 'Intro'] : s.tipo === 'acapela' ? [`Acapela · ${nb} compases`, 'Acapela'] : ['Canción'], Math.min(x1, ancho) - Math.max(x0, 0) - 18)
        if (etiqueta) ctx.fillText(etiqueta, Math.max(x0, 0) + 10, B_Y + 15)
      }
      // uniones
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.5
      for (const u of info.uniones) {
        const x = Math.round(X(u)) + 0.5
        ctx.beginPath()
        ctx.setLineDash([3, 3])
        ctx.moveTo(x, B_Y + 22)
        ctx.lineTo(x, B_Y + B_H)
        ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = C.faint
      ctx.fillText(pv.error ? pv.error : 'Preparando la previsualización…', PADL + 4, B_Y + B_H / 2)
    }
    ctx.restore()
    ctx.fillStyle = C.soft
    ctx.fillText(info ? `Tu extended · ${fmt(info.duracion_s)}` : 'Tu extended', PADL, B_Y + B_H + 15)
    if (audio.modo === 'resultado') {
      const x = X(audio.tiempo)
      ctx.fillStyle = C.ink
      ctx.fillRect(x - 0.75, B_Y, 1.5, B_H)
      ctx.beginPath()
      ctx.moveTo(x - 5, RULER - 8)
      ctx.lineTo(x + 5, RULER - 8)
      ctx.lineTo(x, RULER - 1)
      ctx.closePath()
      ctx.fill()
    }
  }

  // ------------------------------------------------------------------ interacción
  const tiempoDe = (clientX: number): number => {
    const r = cvRef.current?.getBoundingClientRect()
    return ((clientX - (r?.left ?? 0)) + scrollRef.current - PADL) / pps
  }
  const hitEn = (x: number, y: number): Hit | null => hits.current.find((h) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) ?? null

  function alPulsar(ev: React.PointerEvent<HTMLCanvasElement>): void {
    if (!an || !abierto) return
    const r = ev.currentTarget.getBoundingClientRect()
    const x = ev.clientX - r.left
    const y = ev.clientY - r.top
    const h = hitEn(x, y)
    const t = tiempoDe(ev.clientX)
    const e = abierto.edicion
    if (h) {
      ev.currentTarget.setPointerCapture(ev.pointerId)
      const ref = h.tipo === 'R' ? e.song.start_s : h.tipo === 'intro' ? e.intro.start_s : h.tipo === 'ac' ? (e.acapela.start_s ?? 0) : (e.acapela.start_s ?? 0)
      arrastre.current = { tipo: h.tipo, grab: t - ref }
      ponerArrastre(true)
      setCursor('grabbing')
      return
    }
    if (y >= B_Y && y <= B_Y + B_H) {
      audio.usar('resultado')
      audio.ir(Math.max(0, t))
    } else if (y >= A_Y && y <= A_Y + A_H) {
      audio.usar('original')
      audio.ir(clamp(t, 0, an.duracion_s))
    }
    sucio.current = true
  }

  function alMover(ev: React.PointerEvent<HTMLCanvasElement>): void {
    if (!an || !abierto) return
    const r = ev.currentTarget.getBoundingClientRect()
    const x = ev.clientX - r.left
    const y = ev.clientY - r.top
    const d = arrastre.current
    if (!d) {
      const h = hitEn(x, y)
      setCursor(h ? (h.tipo === 'R' || h.tipo === 'acFin' ? 'ew-resize' : 'grab') : y >= A_Y && y <= B_Y + B_H ? 'pointer' : 'default')
      return
    }
    const t = tiempoDe(ev.clientX)
    const t4 = T4(an)
    const store = useStore.getState()
    if (d.tipo === 'intro') {
      const td = clamp(snapBar(an, t - d.grab), 0, an.duracion_s - e8(abierto.edicion.intro.bars, t4))
      store.cambiar((e) => {
        const delta = td - e.intro.start_s
        e.intro.start_s = td
        e.song.start_s += delta
      }, 'arrastre-intro')
    } else if (d.tipo === 'ac') {
      const tc = clamp(snapBar(an, t - d.grab), t4, an.duracion_s - t4)
      store.cambiar((e) => void (e.acapela.start_s = tc), 'arrastre-ac')
    } else if (d.tipo === 'acFin') {
      const tc = abierto.edicion.acapela.start_s ?? 0
      const bars = clamp(Math.round((t - tc) / t4), 1, 64)
      store.cambiar((e) => void (e.acapela.bars = bars), 'arrastre-acfin')
    } else if (d.tipo === 'R') {
      let R = t - d.grab
      if (!ev.altKey) {
        const cerca = an.entradas_voz.find(([te]) => Math.abs(te - 0.015 - R) < 0.12 && true)
        if (cerca) R = cerca[0] - 0.015
      }
      store.cambiar((e) => void (e.song.start_s = R), 'arrastre-R')
    }
  }

  function alSoltar(): void {
    if (arrastre.current) {
      arrastre.current = null
      ponerArrastre(false)
      setCursor('default')
    }
  }

  function alRueda(ev: React.WheelEvent<HTMLCanvasElement>): void {
    const sc = scRef.current
    if (!sc) return
    if (ev.ctrlKey || ev.metaKey) {
      const r = ev.currentTarget.getBoundingClientRect()
      const x = ev.clientX - r.left
      const tBajo = (x + sc.scrollLeft - PADL) / pps
      const nuevo = clamp(pps * Math.exp(-ev.deltaY * 0.01), fit, 160)
      setZoom(nuevo <= fit * 1.001 ? 0 : nuevo)
      requestAnimationFrame(() => {
        sc.scrollLeft = tBajo * nuevo + PADL - x
      })
    } else {
      sc.scrollLeft += Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <canvas ref={cvRef} style={{ width: W, height: TOTAL, cursor, display: 'block', touchAction: 'none' }} onPointerDown={alPulsar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} onWheel={alRueda} />
      <div
        ref={scRef}
        className="overflow-x-auto overflow-y-hidden"
        style={{ height: 14 }}
        onScroll={(e) => {
          scrollRef.current = e.currentTarget.scrollLeft
          sucio.current = true
        }}
        aria-hidden="true"
      >
        <div style={{ width: contenidoW, height: 1 }} />
      </div>
    </div>
  )
}

const e8 = (bars: number, t4: number): number => bars * t4

export { barK }
