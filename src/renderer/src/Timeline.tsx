import { useEffect, useRef, useState } from 'react'
import { audio } from './audio'
import { ponerArrastre, useStore } from './store'
import type { Picos, PicosCrudos } from './types'
import { aBruto, aPantalla, barNumber, clamp, decodificarPicos, fmt, fmtMs, snapBar, T4 } from './util'

const PADL = 16
const MINI_H = 30
const RULER = 26
const ZOOM_MAX = 3000

// Medidas de las pistas (dependen de «altura de la onda»)
let A_Y = 0
let A_H = 132
let B_Y = 0
let B_H = 100
let TOTAL = 0
const TOP = MINI_H + RULER
function medidas(f: number): void {
  A_H = Math.round(132 * f)
  B_H = Math.round(100 * f)
  A_Y = TOP + 28
  B_Y = A_Y + A_H + 36
  TOTAL = B_Y + B_H + 6
}
medidas(1)

type Hit = { tipo: 'R' | 'intro' | 'introFin' | 'ac' | 'acFin' | 'playA' | 'playB' | 'corteX' | 'corteOrigX'; idx?: number; x0: number; x1: number; y0: number; y1: number }
type Colores = Record<'kick' | 'surface' | 'sunken' | 'ink' | 'soft' | 'faint' | 'line' | 'accent' | 'graphite' | 'inst', string>
type Bandas = { bajos: Picos; medios: Picos; altos: Picos }
type Detalle = { ini: number; fin: number; pps: number; original: Picos; voz: Picos; inst: Picos; bandas: Bandas }

let cacheColores: { tema: string; c: Colores } | null = null
function colores(): Colores {
  const tema = document.documentElement.dataset.theme ?? 'light'
  if (cacheColores?.tema === tema) return cacheColores.c
  const cs = getComputedStyle(document.documentElement)
  const g = (n: string): string => cs.getPropertyValue('--' + n).trim()
  const c = { kick: g('kick') || '#e5484d', surface: g('surface'), sunken: g('sunken'), ink: g('ink'), soft: g('soft'), faint: g('faint'), line: g('line'), accent: g('accent'), graphite: g('graphite'), inst: g('inst') }
  cacheColores = { tema, c }
  return c
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function ajustarTexto(ctx: CanvasRenderingContext2D, variantes: string[], ancho: number): string | null {
  for (const v of variantes) if (ctx.measureText(v).width <= ancho) return v
  return null
}

/** Dibuja una forma de onda (mín/máx por píxel) a partir de picos de cualquier resolución. */
function columnas(ctx: CanvasRenderingContext2D, p: Picos, tIni: number, pps: number, W: number, cy: number, amp: number, color: string, alfa = 1): void {
  ctx.fillStyle = color
  ctx.globalAlpha = alfa
  const k = p.pps
  const off = (p as Picos & { ini?: number }).ini ?? 0
  for (let x = 0; x < W; x++) {
    const t0 = tIni + x / pps - off
    const t1 = tIni + (x + 1) / pps - off
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

const COL_BANDAS = { bajos: '#ff5a36', medios: '#3ddc84', altos: '#4aa8ff' }

export function Timeline(): JSX.Element {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const scRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(900)
  const [scrollX, setScrollX] = useState(0)
  const sucio = useRef(true)
  const hits = useRef<Hit[]>([])
  const arrastre = useRef<null | { tipo: Hit['tipo']; grab: number }>(null)
  const scrollRef = useRef(0)
  const seleccion = useRef<null | { carril: 'A' | 'B'; a: number; b: number }>(null) // a, b: segundos (A: canción; B: resultado sin cortes)
  const pan = useRef<null | { tipo: 'mini' | 'regla'; x0: number; sc0: number }>(null)
  const pausaSeguir = useRef(false)
  const tip = useRef<null | { x: number; y: number; texto: string }>(null)
  const detalle = useRef<Detalle | null>(null)
  const [cursor, setCursor] = useState('default')

  const abierto = useStore((s) => s.abierto)
  const preview = useStore((s) => s.preview)
  const zoomSel = useStore((s) => s.zoom)
  const setZoom = useStore((s) => s.setZoom)
  const alto = useStore((s) => s.alto)
  const ondaModo = useStore((s) => s.ondaModo)
  const setVista = useStore((s) => s.setVista)

  medidas(alto)
  const an = abierto?.analisis
  const dur = an?.duracion_s ?? 1
  const durB = preview.info?.duracion_s ?? 0
  const maxDur = Math.max(dur, durB)
  const fit = Math.max(2, (W - 2 * PADL) / maxDur)
  const pps = zoomSel > 0 ? clamp(zoomSel, fit, ZOOM_MAX) : fit
  const contenidoW = maxDur * pps + 2 * PADL

  const est = useRef({ abierto, preview, pps, W, ondaModo })
  est.current = { abierto, preview, pps, W, ondaModo }
  useEffect(() => {
    sucio.current = true
  }, [abierto, preview, pps, W, alto, ondaModo])
  useEffect(() => {
    if (Math.abs(useStore.getState().zoomFit - fit) > 1e-6) setVista({ zoomFit: fit })
  }, [fit, setVista])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(300, Math.floor(el.clientWidth))))
    ro.observe(el)
    setW(Math.max(300, Math.floor(el.clientWidth)))
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const h = (): void => {
      sucio.current = true
    }
    const alPlay = (): void => {
      pausaSeguir.current = false
      sucio.current = true
    }
    const els = [audio.resultado, audio.original]
    const evs = ['pause', 'ended', 'seeked']
    els.forEach((a) => {
      evs.forEach((ev) => a.addEventListener(ev, h))
      a.addEventListener('play', alPlay)
    })
    return () => els.forEach((a) => {
      evs.forEach((ev) => a.removeEventListener(ev, h))
      a.removeEventListener('play', alPlay)
    })
  }, [])

  // ------------------------------------------------------------------ zoom desde fuera (teclado, barra de herramientas)
  useEffect(() => {
    const h = (e: Event): void => {
      const sc = scRef.current
      if (!sc) return
      const d = (e as CustomEvent).detail as { factor?: number; abs?: number; todo?: boolean }
      const st = useStore.getState()
      if (d.todo) {
        st.setZoom(0)
        return
      }
      const actual = est.current.pps
      let nuevo = d.abs ?? actual * (d.factor ?? 1)
      nuevo = clamp(nuevo, fit, ZOOM_MAX)
      // se mantiene fijo el punto bajo el cursor de reproducción (si está a la vista) o el centro de la vista
      const wv = est.current.W
      const tPlay = audio.tiempo
      const xPlay = tPlay * actual + PADL - sc.scrollLeft
      const ancla = xPlay > 0 && xPlay < wv ? xPlay : wv / 2
      const tAncla = (ancla + sc.scrollLeft - PADL) / actual
      st.setZoom(nuevo <= fit * 1.001 ? 0 : nuevo)
      requestAnimationFrame(() => {
        sc.scrollLeft = tAncla * nuevo + PADL - ancla
      })
    }
    window.addEventListener('alargo:zoom', h)
    return () => window.removeEventListener('alargo:zoom', h)
  }, [fit])

  // ------------------------------------------------------------------ picos de detalle (zoom de precisión)
  useEffect(() => {
    if (!abierto || pps < 90) {
      detalle.current = null
      return
    }
    const quiero = Math.min(4000, Math.max(200, Math.round(pps * 1.5)))
    const vIni = Math.max(0, (scrollX - PADL) / pps)
    const vFin = vIni + W / pps
    const d = detalle.current
    if (d && d.ini <= vIni && d.fin >= vFin && d.pps >= quiero * 0.7) return
    const id = abierto.id
    const t = window.setTimeout(() => {
      const marg = (vFin - vIni) * 0.75
      const ini = Math.max(0, vIni - marg)
      const fin = Math.min(dur, vFin + marg)
      window.api.proyectos
        .picosVentana(id, ini, fin, quiero, abierto.picos.original.escala)
        .then((r: { ini: number; fin: number; pps: number; original: PicosCrudos; voz: PicosCrudos; inst: PicosCrudos; bandas: Record<string, PicosCrudos> }) => {
          if (useStore.getState().abierto?.id !== id) return
          detalle.current = {
            ini: r.ini,
            fin: r.fin,
            pps: r.pps,
            original: decodificarPicos(r.original),
            voz: decodificarPicos(r.voz),
            inst: decodificarPicos(r.inst),
            bandas: { bajos: decodificarPicos(r.bandas.bajos), medios: decodificarPicos(r.bandas.medios), altos: decodificarPicos(r.bandas.altos) }
          }
          sucio.current = true
        })
        .catch(() => undefined)
    }, 140)
    return () => window.clearTimeout(t)
  }, [abierto?.id, pps, scrollX, W, dur]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const sc = scRef.current
      const st = useStore.getState()
      if (sonando && sc && st.seguir && !pausaSeguir.current && !arrastre.current && !seleccion.current && !pan.current) {
        const x = audio.tiempo * z + PADL - sc.scrollLeft
        if (x > ancho - 40 || x < 20) sc.scrollLeft = Math.max(0, audio.tiempo * z - ancho * 0.2)
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

  function titulo(ctx: CanvasRenderingContext2D, C: Colores, ancho: number, y: number, nombre: string, sub: string, modo: 'original' | 'resultado', lista: Hit[]): void {
    const activo = audio.modo === modo
    const sonando = activo && audio.sonando
    const cx = PADL + 10
    ctx.beginPath()
    ctx.arc(cx, y, 10, 0, Math.PI * 2)
    ctx.fillStyle = activo ? C.accent : C.sunken
    ctx.fill()
    ctx.fillStyle = activo ? C.surface : C.soft
    if (sonando) {
      ctx.fillRect(cx - 4, y - 4, 2.6, 8)
      ctx.fillRect(cx + 1.4, y - 4, 2.6, 8)
    } else {
      ctx.beginPath()
      ctx.moveTo(cx - 3, y - 5)
      ctx.lineTo(cx + 5, y)
      ctx.lineTo(cx - 3, y + 5)
      ctx.closePath()
      ctx.fill()
    }
    lista.push({ tipo: modo === 'original' ? 'playA' : 'playB', x0: cx - 12, x1: cx + 12, y0: y - 12, y1: y + 12 })
    ctx.textBaseline = 'middle'
    ctx.font = '600 13px "Bricolage Grotesque Variable", system-ui, sans-serif'
    ctx.fillStyle = C.ink
    ctx.fillText(nombre, cx + 18, y)
    const w = ctx.measureText(nombre).width
    ctx.font = '500 12px "Bricolage Grotesque Variable", system-ui, sans-serif'
    ctx.fillStyle = C.faint
    ctx.fillText('· ' + sub, cx + 18 + w + 8, y)
    if (sonando) {
      const txt = 'Escuchando esto'
      const tw = ctx.measureText(txt).width + 18
      ctx.fillStyle = C.accent
      ctx.beginPath()
      ctx.roundRect(ancho - tw - 4, y - 10, tw, 20, 10)
      ctx.fill()
      ctx.fillStyle = C.surface
      ctx.fillText(txt, ancho - tw + 5, y)
    }
  }

  function pintar(ctx: CanvasRenderingContext2D, ancho: number, z: number, scroll: number, ab: NonNullable<typeof abierto>, pv: typeof preview, lista: Hit[]): void {
    const C = colores()
    const a = ab.analisis
    const e = ab.edicion
    const t4 = T4(a)
    const T = a.grid.T
    const X = (t: number): number => t * z + PADL - scroll
    const tIni = (scroll - PADL) / z
    const tFin = tIni + ancho / z
    const modoFrec = est.current.ondaModo === 'frecuencias' && !!ab.picos.bandas
    const det = detalle.current && detalle.current.ini <= tIni + 1e-6 && detalle.current.fin >= tFin - 1e-6 ? detalle.current : null
    const pInst = det?.inst ?? ab.picos.inst
    const pVoz = det?.voz ?? ab.picos.voz
    const bandas: Bandas | undefined = det?.bandas ?? ab.picos.bandas
    lista.length = 0
    ctx.clearRect(0, 0, ancho, TOTAL)
    ctx.font = '500 12px "Bricolage Grotesque Variable", system-ui, sans-serif'
    ctx.textBaseline = 'middle'

    // ---- minimapa (toda la canción, con la parte visible marcada)
    {
      const dtot = Math.max(a.duracion_s, pv.info?.duracion_s ?? 0)
      const zm = (ancho - 2 * PADL) / dtot
      rr(ctx, PADL, 2, ancho - 2 * PADL, MINI_H - 6, 7)
      ctx.fillStyle = C.sunken
      ctx.fill()
      ctx.save()
      rr(ctx, PADL, 2, ancho - 2 * PADL, MINI_H - 6, 7)
      ctx.clip()
      const pm = ab.picos.original
      const cyM = 2 + (MINI_H - 6) / 2
      ctx.fillStyle = C.inst
      ctx.globalAlpha = 0.85
      for (let x = PADL; x < ancho - PADL; x++) {
        const t0 = (x - PADL) / zm
        const t1 = (x - PADL + 1) / zm
        const i0 = Math.max(0, Math.floor(t0 * pm.pps))
        const i1 = Math.min(pm.n, Math.max(i0 + 1, Math.ceil(t1 * pm.pps)))
        let mx = 0
        for (let i = i0; i < i1; i++) mx = Math.max(mx, pm.datos[2 * i + 1], -pm.datos[2 * i])
        const h = (mx / 127) * ((MINI_H - 10) / 2)
        ctx.fillRect(x, cyM - h, 1, Math.max(1, h * 2))
      }
      ctx.globalAlpha = 1
      const vx0 = PADL + Math.max(0, tIni) * zm
      const vx1 = PADL + Math.min(dtot, tFin) * zm
      ctx.fillStyle = C.accent
      ctx.globalAlpha = 0.18
      ctx.fillRect(vx0, 2, Math.max(4, vx1 - vx0), MINI_H - 6)
      ctx.globalAlpha = 1
      ctx.strokeStyle = C.accent
      ctx.lineWidth = 1.5
      ctx.strokeRect(vx0 + 0.5, 2.5, Math.max(4, vx1 - vx0) - 1, MINI_H - 7)
      ctx.lineWidth = 1
      // marcas de intro / acapela / cursor
      if (e.intro.enabled) {
        ctx.fillStyle = C.graphite
        ctx.fillRect(PADL + (e.intro.fuente_s ?? e.intro.start_s) * zm, MINI_H - 8, Math.max(2, e.intro.bars * t4 * zm), 3)
      }
      if (e.acapela.enabled && e.acapela.start_s !== null) {
        ctx.fillStyle = C.accent
        ctx.fillRect(PADL + e.acapela.start_s * zm, MINI_H - 8, Math.max(2, e.acapela.bars * t4 * zm), 3)
      }
      if (audio.modo === 'original') {
        ctx.fillStyle = C.ink
        ctx.fillRect(PADL + audio.tiempo * zm - 0.5, 2, 1.5, MINI_H - 6)
      }
      ctx.restore()
    }

    // ---- regla de tiempo (con subdivisiones al acercar)
    const pasos = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
    const paso = pasos.find((p) => p * z >= 72) ?? 300
    ctx.fillStyle = C.faint
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1
    for (let t = Math.max(0, Math.ceil(tIni / paso) * paso); t <= tFin; t += paso) {
      const x = Math.round(X(t)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, TOP - 7)
      ctx.lineTo(x, TOP - 2)
      ctx.stroke()
      ctx.fillText(paso >= 1 ? fmt(t) : fmtMs(t).replace(/0+$/, '').replace(/\.$/, ''), x + 4, TOP - 12)
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
    // forma de onda: voz e instrumental, o por frecuencias (graves rojos, medios verdes, agudos azules)
    if (modoFrec && bandas) {
      columnas(ctx, bandas.bajos, tIni, z, ancho, cyA + 6, ampA, COL_BANDAS.bajos, 0.95)
      columnas(ctx, bandas.medios, tIni, z, ancho, cyA + 6, ampA * 0.72, COL_BANDAS.medios, 0.95)
      columnas(ctx, bandas.altos, tIni, z, ancho, cyA + 6, ampA * 0.45, COL_BANDAS.altos, 0.95)
    } else {
      columnas(ctx, pInst, tIni, z, ancho, cyA + 6, ampA, C.inst, 0.9)
      columnas(ctx, pVoz, tIni, z, ancho, cyA + 6, ampA, C.accent, 0.95)
    }
    // rejilla estilo DJ: tiempos finos y grises; primer tiempo de cada compás en rojo con banderita; cada 4 compases, su número
    const pxBeat = T * z
    const bIni = Math.ceil((tIni - a.grid.t0) / T)
    const bFin = Math.floor((tFin - a.grid.t0) / T)
    for (let b = bIni; b <= bFin; b++) {
      const bb = ((b % 4) + 4) % 4
      const abajo = bb === 0
      if (!abajo && pxBeat < 7) continue
      if (abajo && pxBeat * 4 < 6) continue
      const k = Math.floor(b / 4)
      const n = barNumber(a, k)
      const frase = abajo && (((n - 1) % 4) + 4) % 4 === 0
      const x = Math.round(X(a.grid.t0 + b * T)) + 0.5
      ctx.lineWidth = 1
      if (abajo) {
        ctx.strokeStyle = C.kick
        ctx.globalAlpha = pxBeat * 4 < 24 ? 0.4 : 0.7
        ctx.beginPath()
        ctx.moveTo(x, A_Y + 26)
        ctx.lineTo(x, A_Y + A_H)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = C.kick
        ctx.beginPath()
        ctx.moveTo(x, A_Y + 32)
        ctx.lineTo(x + (frase ? 7 : 5), A_Y + 26)
        ctx.lineTo(x, A_Y + 26)
        ctx.closePath()
        ctx.fill()
        if (frase && pxBeat * 16 > 46 && n >= 1) ctx.fillText(String(n), x + 10, A_Y + 31)
      } else {
        ctx.strokeStyle = C.ink
        ctx.globalAlpha = 0.2
        ctx.beginPath()
        ctx.moveTo(x, A_Y + 34)
        ctx.lineTo(x, A_Y + A_H - 4)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
    // entradas de voz detectadas
    ctx.fillStyle = C.faint
    for (const [t] of a.entradas_voz) {
      const x = X(t)
      if (x > -4 && x < ancho + 4) ctx.fillRect(x - 0.5, A_Y + A_H - 7, 1.5, 5)
    }
    // (versiones anteriores) trozos cortados de la canción original
    ;(e.cortes ?? []).forEach((c, i) => {
      const x0 = X(c.ini_s)
      const x1 = X(c.fin_s)
      if (x1 < -10 || x0 > ancho + 10) return
      ctx.fillStyle = C.kick
      ctx.globalAlpha = 0.16
      ctx.fillRect(x0, A_Y, x1 - x0, A_H)
      ctx.globalAlpha = 1
      if (x1 - x0 > 28) lista.push({ tipo: 'corteOrigX', idx: i, x0: x0, x1: x0 + 24, y0: A_Y, y1: A_Y + 26 })
    })
    // intro
    if (e.intro.enabled) {
      const td = e.intro.fuente_s ?? e.intro.start_s
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
      ctx.fillStyle = C.graphite
      rr(ctx, x1 - 3, A_Y + 40, 5, A_H - 80, 3)
      ctx.fill()
      lista.push({ tipo: 'intro', x0, x1, y0: A_Y, y1: A_Y + 26 })
      lista.push({ tipo: 'introFin', x0: x1 - 7, x1: x1 + 7, y0: A_Y + 26, y1: A_Y + A_H })
    }
    // selección con el ratón en este carril
    if (seleccion.current && seleccion.current.carril === 'A') {
      const { a: sa, b: sb } = seleccion.current
      const xa = X(Math.min(sa, sb))
      const xb = X(Math.max(sa, sb))
      ctx.fillStyle = C.accent
      ctx.globalAlpha = 0.25
      ctx.fillRect(xa, A_Y, xb - xa, A_H)
      ctx.globalAlpha = 1
      ctx.strokeStyle = C.accent
      ctx.lineWidth = 2
      ctx.strokeRect(xa, A_Y + 1, xb - xa, A_H - 2)
      ctx.lineWidth = 1
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
    // entrada de la canción (donde entra la voz)
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
    titulo(ctx, C, ancho, A_Y - 15, 'Canción original', 'aquí eliges qué trozos usar', 'original', lista)
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
    const cuts = e.cortes_salida ?? []
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
        const rs = useStore.getState().resalte
        if (rs && Date.now() < rs.hasta && ((rs.zona === 'intro' && s.tipo === 'intro') || (rs.zona === 'acapela' && s.tipo === 'acapela'))) {
          ctx.strokeStyle = C.accent
          ctx.lineWidth = 3
          ctx.globalAlpha = Math.min(1, (rs.hasta - Date.now()) / 900)
          ctx.strokeRect(x0 + 1.5, B_Y + 1.5, x1 - x0 - 3, B_H - 3)
          ctx.globalAlpha = 1
          ctx.lineWidth = 1
          sucio.current = true
        }
        ctx.save()
        ctx.beginPath()
        ctx.rect(Math.max(0, x0), B_Y, Math.min(ancho, x1) - Math.max(0, x0), B_H)
        ctx.clip()
        columnas(ctx, pv.picos, tIni, z, ancho, cy, amp, col, s.tipo === 'cancion' ? 0.85 : 1)
        ctx.restore()
        ctx.fillStyle = C.soft
        const nb = String(Math.round(((s.fin - s.ini) / t4) * 10) / 10).replace('.', ',')
        const primeraCancion = s.tipo !== 'cancion' || info.segmentos.find((q) => q.tipo === 'cancion') === s
        const etiqueta = !primeraCancion ? null : ajustarTexto(ctx, s.tipo === 'intro' ? [`Intro · ${nb} compases`, 'Intro'] : s.tipo === 'acapela' ? [`Acapela · ${nb} compases`, 'Acapela'] : ['Canción'], Math.min(x1, ancho) - Math.max(x0, 0) - 18)
        if (etiqueta) ctx.fillText(etiqueta, Math.max(x0, 0) + 10, B_Y + 15)
      }
      // uniones entre partes
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
      // cortes que has hecho en el resultado: línea roja con su ✕
      cuts.forEach((c, i) => {
        const tj = info.cortes_s?.[i]
        if (tj === undefined) return
        const x = Math.round(X(tj)) + 0.5
        if (x < -20 || x > ancho + 20) return
        ctx.strokeStyle = C.kick
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x, B_Y + 28)
        ctx.lineTo(x, B_Y + B_H)
        ctx.stroke()
        ctx.lineWidth = 1
        ctx.fillStyle = C.kick
        ctx.beginPath()
        ctx.arc(x, B_Y + 18, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = C.surface
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x - 3.5, B_Y + 14.5)
        ctx.lineTo(x + 3.5, B_Y + 21.5)
        ctx.moveTo(x + 3.5, B_Y + 14.5)
        ctx.lineTo(x - 3.5, B_Y + 21.5)
        ctx.stroke()
        ctx.lineWidth = 1
        lista.push({ tipo: 'corteX', idx: i, x0: x - 11, x1: x + 11, y0: B_Y + 5, y1: B_Y + 31 })
      })
    } else {
      ctx.fillStyle = C.faint
      ctx.fillText(pv.error ? pv.error : 'Preparando la previsualización…', PADL + 4, B_Y + B_H / 2)
    }
    // selección para cortar (en el resultado; se guarda sin cortes, aquí se muestra con los cortes actuales)
    if (seleccion.current && seleccion.current.carril === 'B') {
      const { a: sa, b: sb } = seleccion.current
      const xa = X(aPantalla(Math.min(sa, sb), cuts))
      const xb = X(aPantalla(Math.max(sa, sb), cuts))
      ctx.fillStyle = C.kick
      ctx.globalAlpha = 0.25
      ctx.fillRect(xa, B_Y, xb - xa, B_H)
      ctx.globalAlpha = 1
      ctx.strokeStyle = C.kick
      ctx.lineWidth = 2
      ctx.strokeRect(xa, B_Y + 1, xb - xa, B_H - 2)
      ctx.lineWidth = 1
    }
    ctx.restore()
    titulo(ctx, C, ancho, B_Y - 15, 'Tu extended', info ? `el resultado que se exporta · dura ${fmt(info.duracion_s)}` : 'el resultado que se exporta', 'resultado', lista)
    if (audio.modo === 'resultado') {
      const x = X(audio.tiempo)
      ctx.fillStyle = C.ink
      ctx.fillRect(x - 0.75, B_Y, 1.5, B_H)
      ctx.beginPath()
      ctx.moveTo(x - 5, TOP - 8)
      ctx.lineTo(x + 5, TOP - 8)
      ctx.lineTo(x, TOP - 1)
      ctx.closePath()
      ctx.fill()
    }
    // globo con la hora exacta mientras arrastras
    if (tip.current) {
      const { x, y, texto } = tip.current
      ctx.font = '600 12px "Bricolage Grotesque Variable", system-ui, sans-serif'
      const w = ctx.measureText(texto).width + 16
      const bx = clamp(x - w / 2, 4, ancho - w - 4)
      const by = Math.max(TOP + 2, y - 34)
      ctx.fillStyle = C.ink
      ctx.beginPath()
      ctx.roundRect(bx, by, w, 22, 8)
      ctx.fill()
      ctx.fillStyle = C.surface
      ctx.fillText(texto, bx + 8, by + 11.5)
    }
  }

  // ------------------------------------------------------------------ interacción
  const tiempoDe = (clientX: number): number => {
    const r = cvRef.current?.getBoundingClientRect()
    return ((clientX - (r?.left ?? 0)) + scrollRef.current - PADL) / pps
  }
  const hitEn = (x: number, y: number): Hit | null => hits.current.find((h) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) ?? null

  /** Ajusta un tiempo al imán elegido (Alt = libre). `porDefecto` es lo que se usa en modo «Auto». */
  function imantar(t: number, porDefecto: 'bar' | 'beat' | 'libre', alt: boolean): number {
    if (!an) return t
    const im = useStore.getState().iman
    const modo = alt ? 'libre' : im === 'auto' ? porDefecto : im === 'compas' ? 'bar' : im === 'tiempo' ? 'beat' : 'libre'
    if (modo === 'bar') return snapBar(an, t)
    if (modo === 'beat') return an.grid.t0 + Math.round((t - an.grid.t0) / an.grid.T) * an.grid.T
    return t
  }

  function etiquetaTiempo(t: number): string {
    if (!an) return fmtMs(t)
    const kb = (t - an.grid.t0) / an.grid.T
    const k = Math.floor(kb / 4)
    const beat = Math.floor(kb - k * 4) + 1
    return `${fmtMs(t)} · compás ${barNumber(an, k)}.${beat}`
  }

  function ponerTip(ev: React.PointerEvent<HTMLCanvasElement>, texto: string): void {
    const r = ev.currentTarget.getBoundingClientRect()
    tip.current = { x: ev.clientX - r.left, y: ev.clientY - r.top, texto }
    sucio.current = true
  }

  function alPulsar(ev: React.PointerEvent<HTMLCanvasElement>): void {
    if (!an || !abierto) return
    const r = ev.currentTarget.getBoundingClientRect()
    const x = ev.clientX - r.left
    const y = ev.clientY - r.top
    const e = abierto.edicion
    // minimapa y regla: desplazarse
    if (y < TOP) {
      ev.currentTarget.setPointerCapture(ev.pointerId)
      const sc = scRef.current
      if (y < MINI_H && sc) {
        const dtot = Math.max(an.duracion_s, preview.info?.duracion_s ?? 0)
        const zm = (W - 2 * PADL) / dtot
        const t = (x - PADL) / zm
        sc.scrollLeft = Math.max(0, t * pps - W / 2 + PADL)
        pan.current = { tipo: 'mini', x0: x, sc0: sc.scrollLeft }
      } else if (sc) {
        pan.current = { tipo: 'regla', x0: ev.clientX, sc0: sc.scrollLeft }
      }
      pausaSeguir.current = true
      setCursor('grabbing')
      return
    }
    const h = hitEn(x, y)
    const t = tiempoDe(ev.clientX)
    const sel = useStore.getState().seleccionando
    if (h && h.tipo === 'corteX' && h.idx !== undefined) {
      useStore.getState().quitarCorte(h.idx)
      return
    }
    if (h && h.tipo === 'corteOrigX' && h.idx !== undefined) {
      useStore.getState().cambiar((ed) => void (ed.cortes = (ed.cortes ?? []).filter((_, i) => i !== h.idx)))
      return
    }
    if (h && (h.tipo === 'playA' || h.tipo === 'playB')) {
      const modo = h.tipo === 'playA' ? 'original' : 'resultado'
      if (audio.modo === modo) audio.alternar()
      else {
        audio.usar(modo)
        void audio.activo.play().catch(() => {})
      }
      sucio.current = true
      return
    }
    if (sel === 'intro' && y >= A_Y && y <= A_Y + A_H) {
      ev.currentTarget.setPointerCapture(ev.pointerId)
      const ini = imantar(clamp(t, 0, an.duracion_s), 'bar', ev.altKey)
      seleccion.current = { carril: 'A', a: ini, b: ini }
      sucio.current = true
      setCursor('crosshair')
      return
    }
    if (sel === 'corte' && y >= B_Y && y <= B_Y + B_H) {
      ev.currentTarget.setPointerCapture(ev.pointerId)
      const cs = e.cortes_salida ?? []
      const u = imantar(aBruto(Math.max(0, t), cs), 'beat', ev.altKey)
      seleccion.current = { carril: 'B', a: u, b: u }
      sucio.current = true
      setCursor('crosshair')
      return
    }
    if (h) {
      ev.currentTarget.setPointerCapture(ev.pointerId)
      const ref = h.tipo === 'R' ? e.song.start_s : h.tipo === 'intro' || h.tipo === 'introFin' ? (e.intro.fuente_s ?? e.intro.start_s) : (e.acapela.start_s ?? 0)
      arrastre.current = { tipo: h.tipo, grab: t - ref }
      ponerArrastre(true)
      setCursor('grabbing')
      return
    }
    // clic en una pista: colocar el cursor de reproducción ahí (sin parar ni arrancar la música)
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
    const sc = scRef.current
    if (pan.current && sc) {
      if (pan.current.tipo === 'mini') {
        const dtot = Math.max(an.duracion_s, preview.info?.duracion_s ?? 0)
        const zm = (W - 2 * PADL) / dtot
        sc.scrollLeft = Math.max(0, ((x - PADL) / zm) * pps - W / 2 + PADL)
      } else {
        sc.scrollLeft = pan.current.sc0 - (ev.clientX - pan.current.x0)
      }
      return
    }
    const d = arrastre.current
    if (seleccion.current) {
      const e = abierto.edicion
      const tb = tiempoDe(ev.clientX)
      if (seleccion.current.carril === 'A') {
        seleccion.current.b = imantar(clamp(tb, 0, an.duracion_s), 'bar', ev.altKey)
        ponerTip(ev, `${fmtMs(Math.min(seleccion.current.a, seleccion.current.b))} → ${fmtMs(Math.max(seleccion.current.a, seleccion.current.b))}`)
      } else {
        const u = imantar(aBruto(Math.max(0, tb), e.cortes_salida ?? []), 'beat', ev.altKey)
        seleccion.current.b = u
        ponerTip(ev, `${fmtMs(Math.min(seleccion.current.a, u))} → ${fmtMs(Math.max(seleccion.current.a, u))} · ${Math.abs(u - seleccion.current.a).toFixed(2).replace('.', ',')} s`)
      }
      sucio.current = true
      return
    }
    if (!d) {
      if (y < TOP) {
        setCursor(y < MINI_H ? 'pointer' : 'grab')
        return
      }
      if (useStore.getState().seleccionando) {
        setCursor('crosshair')
        return
      }
      const h = hitEn(x, y)
      setCursor(h ? (h.tipo === 'R' || h.tipo === 'acFin' || h.tipo === 'introFin' ? 'ew-resize' : h.tipo === 'playA' || h.tipo === 'playB' || h.tipo === 'corteX' || h.tipo === 'corteOrigX' ? 'pointer' : 'grab') : y >= A_Y && y <= B_Y + B_H ? 'pointer' : 'default')
      return
    }
    const t = tiempoDe(ev.clientX)
    const t4 = T4(an)
    const store = useStore.getState()
    if (d.tipo === 'intro') {
      const fs = clamp(imantar(t - d.grab, 'bar', ev.altKey), 0, an.duracion_s - abierto.edicion.intro.bars * t4)
      store.elegirTrozo(fs)
      ponerTip(ev, `Trozo desde ${etiquetaTiempo(fs)}`)
    } else if (d.tipo === 'introFin') {
      const f0 = abierto.edicion.intro.fuente_s ?? abierto.edicion.intro.start_s
      const bars = clamp(Math.round((t - f0) / t4), 1, 32)
      store.cambiar((e) => void (e.intro.bars = bars), 'arrastre-introfin')
      ponerTip(ev, `${bars} compases`)
    } else if (d.tipo === 'ac') {
      const tc = clamp(imantar(t - d.grab, 'bar', ev.altKey), t4, an.duracion_s - t4)
      store.cambiar((e) => void (e.acapela.start_s = tc), 'arrastre-ac')
      ponerTip(ev, `Acapela desde ${etiquetaTiempo(tc)}`)
    } else if (d.tipo === 'acFin') {
      const tc = abierto.edicion.acapela.start_s ?? 0
      const bars = clamp(Math.round((t - tc) / t4), 1, 64)
      store.cambiar((e) => void (e.acapela.bars = bars), 'arrastre-acfin')
      ponerTip(ev, `${bars} compases`)
    } else if (d.tipo === 'R') {
      let R = t - d.grab
      const im = store.iman
      if (im === 'compas' || im === 'tiempo') R = imantar(R, 'libre', ev.altKey)
      else if (!ev.altKey && im === 'auto') {
        const cerca = an.entradas_voz.find(([te]) => Math.abs(te - 0.015 - R) < 0.12)
        if (cerca) R = cerca[0] - 0.015
      }
      store.moverEntrada(R, 'arrastre-R')
      ponerTip(ev, `Entra en ${etiquetaTiempo(R)}`)
    }
  }

  function alSoltar(): void {
    tip.current = null
    sucio.current = true
    if (pan.current) {
      pan.current = null
      setCursor('default')
      return
    }
    if (seleccion.current && an) {
      const { carril, a, b } = seleccion.current
      seleccion.current = null
      const st = useStore.getState()
      st.setSeleccionando(false)
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      if (carril === 'B') {
        st.anadirCorte(lo, hi)
      } else {
        const bars = Math.round((hi - lo) / T4(an))
        st.elegirTrozo(lo)
        if (bars >= 1) st.cambiar((e) => void (e.intro.bars = clamp(bars, 1, 32)), 'trozo-bars')
      }
      setCursor('default')
      return
    }
    if (arrastre.current) {
      arrastre.current = null
      ponerArrastre(false)
      setCursor('default')
    }
  }

  function alRueda(ev: React.WheelEvent<HTMLCanvasElement>): void {
    const sc = scRef.current
    if (!sc) return
    pausaSeguir.current = true
    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      const r = ev.currentTarget.getBoundingClientRect()
      const x = ev.clientX - r.left
      const tBajo = (x + sc.scrollLeft - PADL) / pps
      const nuevo = clamp(pps * Math.exp(-ev.deltaY * 0.012), fit, ZOOM_MAX)
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
          setScrollX(e.currentTarget.scrollLeft)
        }}
        aria-hidden="true"
      >
        <div style={{ width: contenidoW, height: 1 }} />
      </div>
    </div>
  )
}
