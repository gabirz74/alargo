import { create } from 'zustand'
import { audio } from './audio'
import type { Ajustes, Analisis, Edicion, Efectos, EstadoMotor, InfoRender, Picos, Proyecto } from './types'
import { clamp, decodificarPicos, normalizarCortes, snapBar } from './util'

type Abierto = {
  id: string
  proyecto: Proyecto
  analisis: Analisis
  t0Base: number
  picos: { original: Picos; voz: Picos; inst: Picos; bandas?: { bajos: Picos; medios: Picos; altos: Picos } }
  sugerencia: Edicion
  edicion: Edicion
  deshacer: Edicion[]
  rehacer: Edicion[]
}
type Preview = { info: InfoRender | null; picos: Picos | null; renderizando: boolean; error: string | null }
type Instalacion = { activa: boolean; fase: string; fraction: number; detalle?: string; error?: string }
export type Aviso = { id: number; texto: string; tipo: 'ok' | 'error' | 'info'; accion?: { texto: string; ruta?: string; abrir?: string } }
type Vista = 'biblioteca' | 'editor' | 'ajustes'
export type Zona = 'intro' | 'acapela' | 'fin' | 'introTodo' | 'corte'
export type Resalte = { zona: Zona; hasta: number } | null

type Store = {
  vista: Vista
  info: { version: string; plataforma: string; empaquetada: boolean } | null
  ajustes: Ajustes | null
  motor: EstadoMotor | null
  instalacion: Instalacion | null
  proyectos: Proyecto[]
  abierto: Abierto | null
  preview: Preview
  avisos: Aviso[]
  exportando: { activo: boolean; fraction: number }
  zoom: number // píxeles por segundo; 0 = ajustar a la ventana
  fxPresets: Record<string, Efectos>
  iman: 'auto' | 'compas' | 'tiempo' | 'libre'
  seguir: boolean
  ondaModo: 'voz' | 'frecuencias'
  alto: number
  zoomFit: number
  setVista: (v: Partial<Pick<Store, 'iman' | 'seguir' | 'ondaModo' | 'alto' | 'zoomFit'>>) => void
  seleccionando: false | 'intro' | 'corte'
  setSeleccionando: (v: false | 'intro' | 'corte') => void
  moverEntrada: (nuevoR: number, clave?: string) => void
  anadirCorte: (ini: number, fin: number) => void
  quitarCorte: (i: number) => void
  escucharCorte: (i: number) => void
  elegirTrozo: (startS: number | null) => void
  autoEscuchar: boolean
  resalte: Resalte
  guiaVista: boolean

  init: () => Promise<void>
  irA: (v: Vista) => void
  guardarAjustes: (a: Partial<Ajustes>) => Promise<void>
  refrescarMotor: () => Promise<void>
  instalar: (calidad: 'alta' | 'rapida') => Promise<void>
  descargarModelos: () => Promise<void>
  crear: (rutas: string[]) => Promise<void>
  elegirArchivos: () => Promise<void>
  abrir: (id: string) => Promise<void>
  cerrar: () => Promise<void>
  cambiar: (f: (e: Edicion) => void, clave?: string) => void
  deshacer: () => void
  rehacer: () => void
  restablecer: () => void
  restablecerSeccion: (z: 'intro' | 'voz' | 'acapela' | 'sonido' | 'efectos') => void
  escucharZona: (z: Zona) => void
  setAutoEscuchar: (v: boolean) => void
  cerrarGuia: () => void
  moverRejilla: (delta: number) => void
  reiniciarRejilla: () => void
  render: () => void
  exportar: () => Promise<void>
  setZoom: (z: number) => void
  avisar: (texto: string, tipo?: Aviso['tipo'], accion?: Aviso['accion']) => void
  quitarAviso: (id: number) => void
}

let idAviso = 1
let temporizadorRender: number | undefined
let temporizadorGuardar: number | undefined
let renderEnCurso = false
let renderPendiente = false
let ultimaClave = ''
let ultimoCambio = 0
let arrastrando = false
let zonaPendiente: Zona | null = null
let corteIdx = 0

const leerLS = (k: string, def: string): string => {
  try {
    return localStorage.getItem(k) ?? def
  } catch {
    return def
  }
}
const guardarLS = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento */
  }
}

/** Mientras se arrastra un marcador no se recalcula el audio; al soltar sí. */
export function ponerArrastre(b: boolean): void {
  arrastrando = b
  if (!b) window.setTimeout(() => useStore.getState().render(), 0)
}

export function aplicarTema(tema: Ajustes['tema']): void {
  const oscuro = tema === 'oscuro' || (tema === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = oscuro ? 'dark' : 'light'
}

const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/** La rejilla que ve el usuario = la detectada + el desplazamiento que haya aplicado (solo afecta a la interfaz). */
function conRejilla(a: Abierto, e: Edicion): Analisis {
  return { ...a.analisis, grid: { ...a.analisis.grid, t0: a.t0Base + (e.grid?.shift_s ?? 0) } }
}

/** Mantiene la edición dentro de límites razonables. */
function sanear(e: Edicion, an: Analisis): void {
  const dur = an.duracion_s
  e.intro.start_s = clamp(e.intro.start_s, 0, Math.max(0, dur - 4))
  if (e.intro.fuente_s !== null && e.intro.fuente_s !== undefined) e.intro.fuente_s = clamp(e.intro.fuente_s, 0, Math.max(0, dur - 4))
  e.song.start_s = clamp(e.song.start_s, 0, dur - 2)
  if (e.acapela.start_s !== null) e.acapela.start_s = clamp(e.acapela.start_s, 1, dur - 1)
  e.acapela.bars = clamp(Math.round(e.acapela.bars), 1, 64)
  e.cortes = e.cortes ?? []
  e.cortes_salida = e.cortes_salida ?? []
  e.intro.bars = clamp(Math.round(e.intro.bars), 1, 32)
}

export const useStore = create<Store>((set, get) => ({
  vista: 'biblioteca',
  info: null,
  ajustes: null,
  motor: null,
  instalacion: null,
  proyectos: [],
  abierto: null,
  preview: { info: null, picos: null, renderizando: false, error: null },
  avisos: [],
  exportando: { activo: false, fraction: 0 },
  zoom: 0,
  fxPresets: {},
  iman: (leerLS('alargo-iman', 'auto') as Store['iman']),
  seguir: leerLS('alargo-seguir', '1') === '1',
  ondaModo: (leerLS('alargo-onda', 'voz') as Store['ondaModo']),
  alto: parseFloat(leerLS('alargo-alto', '1')) || 1,
  zoomFit: 1,
  seleccionando: false,
  autoEscuchar: leerLS('alargo-auto', '1') === '1',
  resalte: null,
  guiaVista: leerLS('alargo-guia', '1') === '1',

  async init() {
    const api = window.api
    const [info, ajustes, proyectos] = await Promise.all([api.info(), api.ajustes.leer(), api.proyectos.listar()])
    aplicarTema(ajustes.tema)
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicarTema(get().ajustes?.tema ?? 'sistema'))
    set({ info, ajustes, proyectos })
    api.proyectos.alEvento((p: Proyecto) => {
      set((s) => {
        if (p.error === '__borrado__') return { proyectos: s.proyectos.filter((x) => x.id !== p.id) }
        const i = s.proyectos.findIndex((x) => x.id === p.id)
        if (i >= 0 && s.proyectos[i].estado !== 'listo' && p.estado === 'listo') {
          window.setTimeout(() => get().avisar(`«${p.titulo}» está lista para editar`, 'ok', { texto: 'Abrir', abrir: p.id }), 0)
        }
        if (i < 0) return { proyectos: [p, ...s.proyectos] }
        const copia = s.proyectos.slice()
        copia[i] = { ...p }
        return { proyectos: copia }
      })
    })
    api.motor.alProgreso((p: { fase: string; fraction: number; detalle?: string }) => {
      set((s) => (s.instalacion?.activa ? { instalacion: { ...s.instalacion, fase: p.fase, fraction: p.fraction, detalle: p.detalle } } : {}))
    })
    api.proyectos.alExportar((p: { fraction: number }) => set({ exportando: { activo: true, fraction: p.fraction } }))
    audio.alTerminar(() => set({}))
    await get().refrescarMotor()
  },

  irA: (v) => set({ vista: v }),

  async guardarAjustes(a) {
    const r = await window.api.ajustes.guardar(a)
    set({ ajustes: r })
    if (a.tema) aplicarTema(a.tema)
    if (a.calidad) await get().refrescarMotor()
  },

  async refrescarMotor() {
    const calidad = get().ajustes?.calidad ?? 'alta'
    const motor = await window.api.motor.estado(calidad)
    set({ motor })
  },

  async instalar(calidad) {
    await get().guardarAjustes({ calidad })
    set({ instalacion: { activa: true, fase: 'Preparando', fraction: 0 } })
    const r = await window.api.motor.instalar(calidad)
    if (!r.ok) set({ instalacion: { activa: false, fase: '', fraction: 0, error: r.error } })
    else set({ instalacion: null })
    await get().refrescarMotor()
  },

  async descargarModelos() {
    const calidad = get().ajustes?.calidad ?? 'alta'
    set({ instalacion: { activa: true, fase: 'Descargando modelos', fraction: 0 } })
    const r = await window.api.motor.modelos(calidad)
    set({ instalacion: r.ok ? null : { activa: false, fase: '', fraction: 0, error: r.error } })
    await get().refrescarMotor()
  },

  async crear(rutas) {
    if (!rutas.length) return
    const m = get().motor
    if (!m?.motorListo || m.faltan.length) {
      get().avisar('Primero instala el motor de IA (una sola vez).', 'info')
      return
    }
    const nuevos: Proyecto[] = await window.api.proyectos.crear(rutas)
    if (!nuevos.length) get().avisar('No he encontrado audio en lo que soltaste.', 'error')
    else get().avisar(nuevos.length === 1 ? 'Analizando la canción…' : `Analizando ${nuevos.length} canciones…`, 'info')
  },

  async elegirArchivos() {
    const m = get().motor
    if (!m?.motorListo || m.faltan.length) {
      get().avisar('Primero instala el motor de IA (una sola vez).', 'info')
      return
    }
    await window.api.proyectos.elegir()
  },

  async abrir(id) {
    const p = get().proyectos.find((x) => x.id === id)
    if (!p || p.estado !== 'listo') return
    set({ vista: 'editor', abierto: null, preview: { info: null, picos: null, renderizando: true, error: null } })
    try {
      const r = await window.api.proyectos.abrir(id)
      const edicion: Edicion = r.edicion ?? r.sugerencia
      const abierto: Abierto = {
        id,
        proyecto: r.proyecto ?? p,
        analisis: r.analisis,
        t0Base: r.analisis.grid.t0,
        picos: {
          original: decodificarPicos(r.picos.original),
          voz: decodificarPicos(r.picos.voz),
          inst: decodificarPicos(r.picos.inst),
          bandas: r.picos.bandas ? { bajos: decodificarPicos(r.picos.bandas.bajos), medios: decodificarPicos(r.picos.bandas.medios), altos: decodificarPicos(r.picos.bandas.altos) } : undefined
        },
        sugerencia: r.sugerencia,
        edicion,
        deshacer: [],
        rehacer: []
      }
      set({ fxPresets: r.fx_presets ?? {} })
      audio.parar()
      audio.cargarOriginal(`media://p/${id}/pistas/original.flac`)
      audio.usar('resultado')
      abierto.analisis = conRejilla(abierto, edicion)
      set({ abierto })
      get().render()
    } catch (e: any) {
      set({ vista: 'biblioteca', preview: { info: null, picos: null, renderizando: false, error: null } })
      get().avisar('No se pudo abrir: ' + e.message, 'error')
    }
  },

  async cerrar() {
    audio.parar()
    window.clearTimeout(temporizadorRender)
    const a = get().abierto
    if (a) await window.api.proyectos.guardarEdicion(a.id, a.edicion)
    set({ vista: 'biblioteca', abierto: null, preview: { info: null, picos: null, renderizando: false, error: null } })
    void window.api.proyectos.cerrar()
  },

  cambiar(f, clave) {
    const a = get().abierto
    if (!a) return
    const nueva = clonar(a.edicion)
    f(nueva)
    sanear(nueva, a.analisis)
    if (JSON.stringify(nueva) === JSON.stringify(a.edicion)) return
    const cambioIntro = JSON.stringify([a.edicion.intro, a.edicion.song]) !== JSON.stringify([nueva.intro, nueva.song])
    const cambioAcap = JSON.stringify(a.edicion.acapela) !== JSON.stringify(nueva.acapela)
    const cambioFxIntro = JSON.stringify(a.edicion.fx?.intro) !== JSON.stringify(nueva.fx?.intro)
    const cambioFxSalida = JSON.stringify(a.edicion.fx?.salida) !== JSON.stringify(nueva.fx?.salida)
    const cambioFuente = JSON.stringify([a.edicion.intro.fuente_s, a.edicion.intro.capas]) !== JSON.stringify([nueva.intro.fuente_s, nueva.intro.capas])
    const cambioCortes = JSON.stringify([a.edicion.cortes, a.edicion.cortes_salida]) !== JSON.stringify([nueva.cortes, nueva.cortes_salida])
    zonaPendiente = cambioCortes ? 'corte' : cambioFuente ? 'introTodo' : cambioIntro || cambioFxIntro ? 'intro' : cambioAcap ? 'acapela' : cambioFxSalida ? 'fin' : null
    const ahora = Date.now()
    const fusionar = !!clave && clave === ultimaClave && ahora - ultimoCambio < 900
    ultimaClave = clave ?? ''
    ultimoCambio = ahora
    const deshacer = fusionar ? a.deshacer : [...a.deshacer.slice(-60), a.edicion]
    set({ abierto: { ...a, edicion: nueva, analisis: conRejilla(a, nueva), deshacer, rehacer: [] } })
    window.clearTimeout(temporizadorRender)
    if (!arrastrando) temporizadorRender = window.setTimeout(() => get().render(), 280)
    window.clearTimeout(temporizadorGuardar)
    temporizadorGuardar = window.setTimeout(() => {
      const b = get().abierto
      if (b) void window.api.proyectos.guardarEdicion(b.id, b.edicion)
    }, 700)
  },

  deshacer() {
    const a = get().abierto
    if (!a || !a.deshacer.length) return
    const previa = a.deshacer[a.deshacer.length - 1]
    set({ abierto: { ...a, edicion: previa, analisis: conRejilla(a, previa), deshacer: a.deshacer.slice(0, -1), rehacer: [...a.rehacer, a.edicion] } })
    ultimaClave = ''
    window.clearTimeout(temporizadorRender)
    temporizadorRender = window.setTimeout(() => get().render(), 120)
  },

  rehacer() {
    const a = get().abierto
    if (!a || !a.rehacer.length) return
    const sig = a.rehacer[a.rehacer.length - 1]
    set({ abierto: { ...a, edicion: sig, analisis: conRejilla(a, sig), rehacer: a.rehacer.slice(0, -1), deshacer: [...a.deshacer, a.edicion] } })
    ultimaClave = ''
    window.clearTimeout(temporizadorRender)
    temporizadorRender = window.setTimeout(() => get().render(), 120)
  },

  restablecer() {
    const a = get().abierto
    if (!a) return
    ultimaClave = ''
    set({ abierto: { ...a, edicion: clonar(a.sugerencia), analisis: conRejilla(a, a.sugerencia), deshacer: [...a.deshacer.slice(-60), a.edicion], rehacer: [] } })
    window.clearTimeout(temporizadorRender)
    temporizadorRender = window.setTimeout(() => get().render(), 80)
  },

  restablecerSeccion(z) {
    const a = get().abierto
    if (!a) return
    const sug = a.sugerencia
    get().cambiar((e) => {
      if (z === 'intro') e.intro = { ...sug.intro, start_s: e.intro.start_s }
      if (z === 'voz') {
        e.intro.start_s = sug.intro.start_s
        e.song.start_s = sug.song.start_s
      }
      if (z === 'acapela') e.acapela = { ...sug.acapela }
      if (z === 'efectos') e.fx = JSON.parse(JSON.stringify(sug.fx))
      if (z === 'sonido') {
        e.crossfade_ms = sug.crossfade_ms
        e.end_fade_ms = sug.end_fade_ms
        e.master = { ...sug.master }
      }
    })
  },

  escucharZona(z) {
    const info = get().preview.info
    if (!info) return
    if (z === 'corte') {
      const t = info.cortes_s?.[corteIdx]
      if (t !== undefined) audio.tramo(Math.max(0, t - 4), t + 5)
      return
    }
    if (z === 'introTodo') {
      const sg = info.segmentos.find((x) => x.tipo === 'cancion')
      audio.tramo(0, Math.min(info.duracion_s, (sg?.ini ?? 12) + 3))
      return
    }
    if (z === 'fin') {
      audio.tramo(Math.max(0, info.duracion_s - 14), info.duracion_s)
      return
    }
    const seg = info.segmentos.find((s) => (z === 'intro' ? s.tipo === 'cancion' : s.tipo === 'acapela'))
    if (!seg) {
      if (z === 'intro') audio.tramo(0, Math.min(10, info.duracion_s))
      return
    }
    if (z === 'intro') audio.tramo(Math.max(0, seg.ini - 5), seg.ini + 6)
    else audio.tramo(Math.max(0, seg.ini - 4), seg.ini + 8)
  },

  setSeleccionando: (v) => set({ seleccionando: v }),

  setVista(v) {
    if (v.iman) guardarLS('alargo-iman', v.iman)
    if (v.seguir !== undefined) guardarLS('alargo-seguir', v.seguir ? '1' : '0')
    if (v.ondaModo) guardarLS('alargo-onda', v.ondaModo)
    if (v.alto) guardarLS('alargo-alto', String(v.alto))
    set(v)
  },

  moverEntrada(nuevoR, clave) {
    const a = get().abierto
    if (!a) return
    const T = a.analisis.grid.T
    get().cambiar((e) => {
      const d = nuevoR - e.song.start_s
      e.intro.start_s += Math.round(d / T) * T   // el golpe acompaña a la entrada, para que la intro no cambie de longitud
      e.song.start_s = nuevoR
    }, clave)
  },

  anadirCorte(ini, fin) {
    if (fin - ini < 0.05) return
    get().cambiar((e) => {
      const lista = normalizarCortes([...(e.cortes_salida ?? []), { ini_s: ini, fin_s: fin }])
      e.cortes_salida = lista
      corteIdx = Math.max(0, lista.findIndex((c) => ini >= c.ini_s - 0.02 && ini <= c.fin_s + 0.02))
    })
  },

  quitarCorte(i) {
    get().cambiar((e) => {
      const l = (e.cortes_salida ?? []).slice()
      l.splice(i, 1)
      e.cortes_salida = l
    })
  },

  escucharCorte(i) {
    const t = get().preview.info?.cortes_s?.[i]
    if (t !== undefined) audio.tramo(Math.max(0, t - 4), t + 5)
  },

  elegirTrozo(startS) {
    get().cambiar((e) => {
      e.intro.fuente_s = startS === null || Math.abs(startS - e.intro.start_s) < 0.01 ? null : startS
    }, 'trozo')
  },

  setAutoEscuchar(v) {
    guardarLS('alargo-auto', v ? '1' : '0')
    set({ autoEscuchar: v })
  },

  cerrarGuia() {
    guardarLS('alargo-guia', '0')
    set({ guiaVista: false })
  },

  moverRejilla(delta) {
    const a = get().abierto
    if (!a) return
    const shift = (a.edicion.grid?.shift_s ?? 0) + delta
    const nuevo = { ...a.analisis, grid: { ...a.analisis.grid, t0: a.t0Base + shift } }
    get().cambiar((e) => {
      e.grid = { shift_s: shift }
      e.intro.start_s = snapBar(nuevo, e.intro.start_s)
      if (e.acapela.start_s !== null) e.acapela.start_s = snapBar(nuevo, e.acapela.start_s)
    }, 'rejilla')
  },

  reiniciarRejilla() {
    const a = get().abierto
    if (!a) return
    get().moverRejilla(-(a.edicion.grid?.shift_s ?? 0))
  },

  render() {
    const a = get().abierto
    if (!a) return
    if (renderEnCurso) {
      renderPendiente = true
      return
    }
    renderEnCurso = true
    set((s) => ({ preview: { ...s.preview, renderizando: true, error: null } }))
    const edicion = a.edicion
    window.api.proyectos
      .render(a.id, edicion)
      .then((info: InfoRender) => {
        if (get().abierto?.id !== a.id) return
        const quedabaSonando = audio.sonando
        audio.cargarResultado(info.url)
        set({ preview: { info, picos: decodificarPicos(info.picos), renderizando: false, error: null } })
        if (zonaPendiente) {
          const z = zonaPendiente
          zonaPendiente = null
          set({ resalte: { zona: z, hasta: Date.now() + 2200 } })
          if (get().autoEscuchar && !quedabaSonando && !arrastrando) get().escucharZona(z)
        }
      })
      .catch((e: Error) => {
        set((s) => ({ preview: { ...s.preview, renderizando: false, error: e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') } }))
      })
      .finally(() => {
        renderEnCurso = false
        if (renderPendiente) {
          renderPendiente = false
          get().render()
        }
      })
  },

  async exportar() {
    const { abierto, ajustes } = get()
    if (!abierto || !ajustes) return
    const { analisis: an, proyecto } = abierto
    const nombre = ajustes.patron
      .replaceAll('{titulo}', an.titulo || proyecto.titulo)
      .replaceAll('{artista}', an.artista || proyecto.artista)
      .replaceAll('{bpm}', String(Math.round(an.bpm)))
    set({ exportando: { activo: true, fraction: 0 } })
    try {
      const r = await window.api.proyectos.exportar(abierto.id, abierto.edicion, {
        formato: ajustes.formato,
        nombre,
        etiquetas: { title: `${an.titulo} (Extended)`, artist: an.artista, comment: 'Creado con Alargo' }
      })
      if (!r.cancelado) get().avisar('Extended guardado', 'ok', { texto: 'Mostrar en carpeta', ruta: r.archivo })
    } catch (e: any) {
      get().avisar('No se pudo exportar: ' + e.message, 'error')
    } finally {
      set({ exportando: { activo: false, fraction: 0 } })
    }
  },

  setZoom: (z) => set({ zoom: z }),

  avisar(texto, tipo = 'info', accion) {
    const id = idAviso++
    set((s) => ({ avisos: [...s.avisos, { id, texto, tipo, accion }] }))
    window.setTimeout(() => get().quitarAviso(id), accion ? 9000 : 4500)
  },
  quitarAviso: (id) => set((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) }))
}))
