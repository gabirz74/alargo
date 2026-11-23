import { create } from 'zustand'
import { audio } from './audio'
import type { Ajustes, Analisis, Edicion, EstadoMotor, InfoRender, Picos, Proyecto } from './types'
import { clamp, decodificarPicos, snapBar } from './util'

type Abierto = {
  id: string
  proyecto: Proyecto
  analisis: Analisis
  t0Base: number
  picos: { original: Picos; voz: Picos; inst: Picos }
  sugerencia: Edicion
  edicion: Edicion
  deshacer: Edicion[]
  rehacer: Edicion[]
}
type Preview = { info: InfoRender | null; picos: Picos | null; renderizando: boolean; error: string | null }
type Instalacion = { activa: boolean; fase: string; fraction: number; detalle?: string; error?: string }
export type Aviso = { id: number; texto: string; tipo: 'ok' | 'error' | 'info'; accion?: { texto: string; ruta: string } }
type Vista = 'biblioteca' | 'editor' | 'ajustes'

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
  e.song.start_s = clamp(e.song.start_s, 0, dur - 2)
  if (e.acapela.start_s !== null) e.acapela.start_s = clamp(e.acapela.start_s, 1, dur - 1)
  e.acapela.bars = clamp(Math.round(e.acapela.bars), 1, 64)
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
        picos: { original: decodificarPicos(r.picos.original), voz: decodificarPicos(r.picos.voz), inst: decodificarPicos(r.picos.inst) },
        sugerencia: r.sugerencia,
        edicion,
        deshacer: [],
        rehacer: []
      }
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
        audio.cargarResultado(info.url)
        set({ preview: { info, picos: decodificarPicos(info.picos), renderizando: false, error: null } })
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
