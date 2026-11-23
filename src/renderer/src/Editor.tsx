import { useEffect, useRef, useState } from 'react'
import { audio } from './audio'
import { Inspector } from './Inspector'
import { Timeline } from './Timeline'
import { useStore } from './store'
import { Barra, Btn, BtnIcono, Icono, Interruptor, Segmentado } from './ui'
import { fmt, NOMBRE_AVISO, T4 } from './util'

/** Se vuelve a pintar mientras suena (y al instante cuando algo cambia en el reproductor). */
function useReproductor(): void {
  const [, forzar] = useState(0)
  useEffect(() => {
    const els = [audio.resultado, audio.original]
    const evs = ['play', 'pause', 'ended', 'seeked', 'loadedmetadata']
    const h = (): void => forzar((n) => n + 1)
    els.forEach((a) => evs.forEach((ev) => a.addEventListener(ev, h)))
    return () => els.forEach((a) => evs.forEach((ev) => a.removeEventListener(ev, h)))
  }, [])
}

function Posicion(): JSX.Element {
  const [t, setT] = useState(0)
  const [d, setD] = useState(0)
  useEffect(() => {
    let raf = 0
    let ultimo = 0
    const f = (n: number): void => {
      raf = requestAnimationFrame(f)
      if (n - ultimo > 50) {
        ultimo = n
        setT(audio.tiempo)
        setD(audio.duracion)
      }
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [])
  const p = d > 0 ? (t / d) * 100 : 0
  return (
    <>
      <span className="num w-[112px] shrink-0 text-[14px]">
        {fmt(t, true)} <span className="text-faint">/ {fmt(d)}</span>
      </span>
      <input type="range" aria-label="Posición" className="min-w-[120px] flex-1" min={0} max={Math.max(0.1, d)} step={0.01} value={t} style={{ ['--p' as string]: `${p}%` }} onChange={(e) => audio.ir(parseFloat(e.target.value))} />
    </>
  )
}

function BotonT({ n, titulo, onClick, activo, grande }: { n: string; titulo: string; onClick: () => void; activo?: boolean; grande?: boolean }): JSX.Element {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick} className={`no-drag grid shrink-0 place-items-center rounded-full transition ${grande ? 'h-11 w-11 bg-accent text-accent-ink hover:brightness-110' : `h-9 w-9 ${activo ? 'bg-accent-soft text-accent' : 'text-soft hover:bg-sunken hover:text-ink'}`}`}>
      <Icono n={n} size={grande ? 20 : 17} />
    </button>
  )
}

function Transporte(): JSX.Element {
  const preview = useStore((s) => s.preview)
  const auto = useStore((s) => s.autoEscuchar)
  const setAuto = useStore((s) => s.setAutoEscuchar)
  const [mostrarAtajos, setMostrarAtajos] = useState(false)
  useReproductor()
  const info = preview.info
  const modo = audio.modo
  const sonando = audio.sonando

  useEffect(() => {
    const h = (): void => setMostrarAtajos(true)
    window.addEventListener('alargo:atajos', h)
    return () => window.removeEventListener('alargo:atajos', h)
  }, [])

  return (
    <div className="rounded-2xl bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <BotonT n="inicio" titulo="Ir al principio (Inicio)" onClick={() => audio.alInicio()} />
        <BotonT n="atras5" titulo="Retroceder 5 segundos (←)" onClick={() => audio.saltar(-5)} />
        <BotonT grande n={sonando ? 'pause' : 'play'} titulo={sonando ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'} onClick={() => audio.alternar()} />
        <BotonT n="adelante5" titulo="Adelantar 5 segundos (→)" onClick={() => audio.saltar(5)} />
        <BotonT n="final" titulo="Ir al final (Fin)" onClick={() => audio.alFinal()} />
        <div className="ml-3 flex min-w-[260px] flex-1 items-center gap-3">
          <Posicion />
        </div>
        <BotonT n={audio.silencio || audio.volumen === 0 ? 'silencio' : 'volumen'} titulo="Silenciar (M)" activo={audio.silencio} onClick={() => { audio.alternarSilencio(); useStore.setState({}) }} />
        <input type="range" aria-label="Volumen" style={{ width: 74, ['--p' as string]: `${(audio.silencio ? 0 : audio.volumen) * 100}%` }} min={0} max={1} step={0.01} value={audio.silencio ? 0 : audio.volumen} onChange={(e) => { audio.poner(parseFloat(e.target.value)); useStore.setState({}) }} />
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-line pt-3">
        <div>
          <div className="mb-1 text-[12px] text-faint">Qué escuchas</div>
          <Segmentado valor={modo} opciones={[{ v: 'resultado', t: 'Tu extended', titulo: 'Atajo: 1' }, { v: 'original', t: 'Canción original', titulo: 'Atajo: 2' }]} onChange={(v) => { audio.usar(v); useStore.setState({}) }} />
        </div>
        <div>
          <div className="mb-1 text-[12px] text-faint">Repetir</div>
          <div className="flex gap-2">
            <button type="button" aria-pressed={audio.bucleTodo} title="Cuando llega al final vuelve a empezar (L)" onClick={() => { audio.alternarBucleTodo(); useStore.setState({}) }} className={`no-drag h-8 rounded-xl px-3 text-[13px] transition ${audio.bucleTodo ? 'bg-accent-soft font-medium text-accent' : 'bg-sunken text-soft hover:text-ink'}`}>
              Toda la pista
            </button>
            <button type="button" aria-pressed={audio.bucleTramo} title="Al oír una unión (los botones ⟷ de arriba), la repite una y otra vez (R)" onClick={() => { audio.alternarBucleTramo(); useStore.setState({}) }} className={`no-drag h-8 rounded-xl px-3 text-[13px] transition ${audio.bucleTramo ? 'bg-accent-soft font-medium text-accent' : 'bg-sunken text-soft hover:text-ink'}`}>
              Las uniones
            </button>
          </div>
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="mb-1 flex items-center justify-end gap-3 text-[13px] text-soft">
            <span>Oír el efecto al cambiar algo</span>
            <Interruptor etiqueta="Oír el efecto al cambiar algo" valor={auto} onChange={setAuto} />
            <BtnIcono n="teclado" titulo="Atajos de teclado (?)" onClick={() => setMostrarAtajos(true)} />
          </div>
          <p className="text-right text-[12px] leading-snug text-faint">Cuando mueves un ajuste, suena solo el trozo que has cambiado, sin que tengas que buscarlo.</p>
        </div>
        {preview.renderizando && <span className="pulso text-[12px] text-faint">Actualizando…</span>}
      </div>
      {mostrarAtajos && <Atajos onCerrar={() => setMostrarAtajos(false)} />}
    </div>
  )
}

const ATAJOS: [string, string][] = [
  ['Espacio', 'Reproducir / pausar'],
  ['Inicio  ·  Intro', 'Ir al principio'],
  ['Fin', 'Ir al final'],
  ['←  →', 'Retroceder / adelantar 5 s'],
  ['Mayús + ←  →', 'Retroceder / adelantar 1 s'],
  ['Alt + ←  →', 'Retroceder / adelantar un compás'],
  ['[  ]', 'Ir al empalme anterior / siguiente'],
  ['I', 'Probar el empalme de la intro'],
  ['A', 'Probar el empalme de la acapela'],
  ['F', 'Probar el final (eco, reverb…)'],
  ['R', 'Repetir las uniones en bucle'],
  ['L', 'Repetir toda la pista en bucle'],
  ['1  ·  2', 'Escuchar tu extended / la canción original'],
  ['M', 'Silenciar'],
  ['+  −  0', 'Acercar / alejar / ver toda la canción'],
  ['Ctrl/Cmd + rueda', 'Zoom donde está el ratón'],
  ['Alt + arrastrar', 'Mover sin imán (libre)'],
  ['P', 'Ocultar o mostrar el panel de ajustes'],
  ['S', 'Seguir o no el cursor de reproducción'],
  ['Cmd/Ctrl + Z', 'Deshacer'],
  ['Cmd/Ctrl + Mayús + Z', 'Rehacer'],
  ['Cmd/Ctrl + E', 'Exportar'],
  ['?', 'Ver esta ayuda']
]

function Atajos({ onCerrar }: { onCerrar: () => void }): JSX.Element {
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCerrar])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={onCerrar} role="dialog" aria-label="Atajos de teclado">
      <div className="w-full max-w-[460px] rounded-3xl bg-surface p-7 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="display text-[20px] font-bold">Atajos de teclado</h2>
          <BtnIcono n="cerrar" titulo="Cerrar" onClick={onCerrar} />
        </div>
        <ul className="mt-4">
          {ATAJOS.map(([k, d]) => (
            <li key={k} className="flex items-center justify-between gap-4 border-t border-line py-2 text-[13px] first:border-0">
              <span className="text-soft">{d}</span>
              <kbd className="num rounded-lg bg-sunken px-2 py-1 text-[12px]">{k}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Guia(): JSX.Element | null {
  const { guiaVista, cerrarGuia } = useStore()
  if (!guiaVista) return null
  return (
    <div className="relative rounded-2xl bg-accent-soft p-5 pr-12 text-[13px] leading-relaxed">
      <div className="display mb-1 text-[16px] font-semibold text-accent">Cómo se usa</div>
      <ul className="grid gap-1 text-ink">
        <li>
          <b className="font-semibold">Arriba</b> está tu <b className="font-semibold">canción original</b>: ahí eliges qué trozos usar. <b className="font-semibold">Abajo</b> está <b className="font-semibold">tu extended</b>: el resultado, lo que se exporta.
        </li>
        <li>La rejilla muestra los tiempos (kicks): el primer tiempo de cada compás en <b className="font-semibold text-danger">rojo</b>. Arrastra por la barra de arriba para moverte, acerca con Ctrl/Cmd + rueda o con + y −, y mantén <b className="font-semibold">Alt</b> al arrastrar para mover sin imán.</li>
        <li>En el panel de la derecha ve abriendo <b className="font-semibold">una sección cada vez</b>: qué suena en la intro, cuándo entra la canción, la acapela, los efectos… y al final «Cortar partes» para quitar de tu extended lo que no quieras.</li>
        <li>También puedes arrastrar por la pista de arriba: el bloque gris (intro), la línea «Entra la voz» y el bloque azul (acapela). Cada cambio suena solo para que oigas su efecto.</li>
      </ul>
      <div className="absolute right-2 top-2">
        <BtnIcono n="cerrar" titulo="Entendido, ocultar" onClick={cerrarGuia} />
      </div>
    </div>
  )
}

function Resumen(): JSX.Element | null {
  const info = useStore((s) => s.preview.info)
  const ab = useStore((s) => s.abierto)
  const escuchar = useStore((s) => s.escucharZona)
  if (!info || !ab) return null
  const t4 = T4(ab.analisis)
  // une los trozos de canción (puede haber varios si has cortado partes)
  const partes: { tipo: 'intro' | 'cancion' | 'acapela'; ini: number; fin: number; largo: number }[] = []
  for (const s of info.segmentos) {
    const u = partes[partes.length - 1]
    if (u && u.tipo === 'cancion' && s.tipo === 'cancion') {
      u.fin = s.fin
      u.largo += s.fin - s.ini
    } else partes.push({ tipo: s.tipo, ini: s.ini, fin: s.fin, largo: s.fin - s.ini })
  }
  const nombres = { intro: 'Intro', cancion: 'Canción', acapela: 'Acapela' } as const
  const color = { intro: 'bg-graphite', cancion: 'bg-faint', acapela: 'bg-accent' } as const
  const nCortes = info.cortes_s?.length ?? 0
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Estructura de tu extended">
        {partes.map((p, i) => {
          const n = Math.round((p.largo / t4) * 10) / 10
          const previa = partes[i - 1]
          const zona = previa ? (p.tipo === 'cancion' ? 'intro' : 'acapela') : null
          return (
            <div key={p.tipo + i} className="flex items-center gap-1.5">
              {zona && (
                <button type="button" title={zona === 'intro' ? 'Escuchar solo el paso de la intro a la canción (I)' : 'Escuchar solo el paso de la canción a la acapela (A)'} aria-label={zona === 'intro' ? 'Escuchar el paso de la intro a la canción' : 'Escuchar el paso de la canción a la acapela'} onClick={() => escuchar(zona)} className="no-drag grid h-9 w-9 place-items-center rounded-full bg-sunken text-soft transition hover:bg-accent-soft hover:text-accent">
                  <Icono n="union" size={16} />
                </button>
              )}
              <button type="button" title="Escuchar esta parte desde su principio" onClick={() => { audio.usar('resultado'); audio.ir(p.ini); void audio.resultado.play().catch(() => {}) }} className="no-drag flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-left text-[13px] hover:bg-sunken">
                <span className={`h-2.5 w-2.5 rounded-full ${color[p.tipo]}`} />
                <span>
                  <b className="font-semibold">{nombres[p.tipo]}</b>
                  <span className="num ml-2 text-soft">
                    {fmt(p.ini)}–{fmt(p.fin)}
                    {p.tipo !== 'cancion' ? ` · ${String(n).replace('.', ',')} compases` : nCortes ? ` · ${nCortes} ${nCortes === 1 ? 'corte' : 'cortes'}` : ''}
                  </span>
                </span>
              </button>
            </div>
          )
        })}
      </div>
      <p className="mt-2 px-1 text-[12px] leading-snug text-faint">Pulsa una parte para oírla desde su principio. Pulsa el botón entre dos partes para oír solo el paso de una a otra.</p>
    </div>
  )
}

export function Editor(): JSX.Element {
  const { abierto, cerrar, deshacer, rehacer, restablecer, preview, exportar, exportando, ajustes, info } = useStore()
  const mac = info?.plataforma === 'darwin'
  const [panel, setPanel] = useState(true)
  const refAbierto = useRef(abierto)
  refAbierto.current = abierto

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text') return
      const mod = e.metaKey || e.ctrlKey
      const st = useStore.getState()
      const sonar = (): void => void audio.activo.play().catch(() => {})
      const uniones = st.preview.info?.uniones ?? []
      const hecho = (): void => {
        e.preventDefault()
        useStore.setState({})
      }
      if (e.code === 'Space') {
        if (t?.tagName === 'BUTTON' && !(t as HTMLButtonElement).closest('[role=dialog]')) (t as HTMLButtonElement).blur()
        audio.alternar()
        hecho()
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) rehacer()
        else deshacer()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        rehacer()
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        void exportar()
      } else if (mod) {
        return
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const s = e.key === 'ArrowLeft' ? -1 : 1
        const ab = refAbierto.current
        const paso = e.altKey && ab ? T4(ab.analisis) : e.shiftKey ? 1 : 5
        audio.saltar(s * paso)
        hecho()
      } else if (e.key === 'Home' || e.key === 'Enter') {
        audio.alInicio()
        hecho()
      } else if (e.key === 'End') {
        audio.alFinal()
        hecho()
      } else if (e.key === '[' || e.key === ']') {
        const ahora = audio.tiempo
        const objetivo = e.key === ']' ? uniones.find((u) => u > ahora + 0.3) : [...uniones].reverse().find((u) => u < ahora - 0.3)
        if (objetivo !== undefined) {
          audio.usar('resultado')
          audio.ir(objetivo)
          if (!audio.sonando) sonar()
        }
        hecho()
      } else if (e.key.toLowerCase() === 'i') {
        st.escucharZona('intro')
        hecho()
      } else if (e.key.toLowerCase() === 'a') {
        st.escucharZona('acapela')
        hecho()
      } else if (e.key.toLowerCase() === 'f') {
        st.escucharZona('fin')
        hecho()
      } else if (e.key.toLowerCase() === 'r') {
        audio.alternarBucleTramo()
        hecho()
      } else if (e.key.toLowerCase() === 'l') {
        audio.alternarBucleTodo()
        hecho()
      } else if (e.key.toLowerCase() === 'm') {
        audio.alternarSilencio()
        hecho()
      } else if (e.key === '1') {
        audio.usar('resultado')
        hecho()
      } else if (e.key === '2') {
        audio.usar('original')
        hecho()
      } else if (e.key === '+' || e.key === '=') {
        zoomEvt({ factor: 1.6 })
        hecho()
      } else if (e.key === '-' || e.key === '_') {
        zoomEvt({ factor: 1 / 1.6 })
        hecho()
      } else if (e.key === '0') {
        zoomEvt({ todo: true })
        hecho()
      } else if (e.key.toLowerCase() === 'p') {
        setPanel((v) => !v)
        hecho()
      } else if (e.key.toLowerCase() === 's') {
        st.setVista({ seguir: !st.seguir })
        hecho()
      } else if (e.key === '?') {
        window.dispatchEvent(new Event('alargo:atajos'))
        hecho()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [deshacer, rehacer, exportar])

  if (!abierto) {
    return (
      <div className="grid h-full place-items-center text-soft">
        <span className="pulso">Abriendo la canción…</span>
      </div>
    )
  }
  const { analisis: an, proyecto, deshacer: d, rehacer: r } = abierto
  const avisos = preview.info?.avisos ?? []

  return (
    <div className="flex h-full flex-col">
      <header className={`drag flex h-14 shrink-0 items-center gap-1 pr-4 ${mac ? 'pl-24' : 'pl-4'}`}>
        <BtnIcono n="atras" titulo="Volver a la biblioteca" onClick={() => void cerrar()} />
        {proyecto.portada && <img src={`media://p/${abierto.id}/pistas/portada.jpg`} alt="" className="ml-1 h-9 w-9 rounded-lg object-cover" draggable={false} />}
        <div className="ml-1 min-w-0">
          <div className="display truncate text-[17px] font-semibold leading-tight">{an.titulo || proyecto.titulo}</div>
          <div className="truncate text-[12px] leading-tight text-soft">
            {an.artista || 'Artista desconocido'} · <span className="num">{an.bpm.toString().replace('.', ',')} BPM</span>
          </div>
        </div>
        <div className="flex-1" />
        <BtnIcono n="deshacer" titulo="Deshacer (Cmd/Ctrl+Z)" onClick={deshacer} disabled={!d.length} />
        <BtnIcono n="rehacer" titulo="Rehacer (Cmd/Ctrl+Mayús+Z)" onClick={rehacer} disabled={!r.length} />
        <Btn variante="fantasma" tam="sm" icono="repetir" onClick={restablecer} titulo="Deshace todos tus cambios y vuelve a la propuesta de la IA">
          Volver a la propuesta de la IA
        </Btn>
        <Btn variante="primario" icono="bajar" className="ml-2" disabled={exportando.activo || !preview.info} onClick={() => void exportar()} titulo="Exportar (Cmd/Ctrl+E)">
          {exportando.activo ? 'Exportando…' : `Exportar ${ajustes?.formato.toUpperCase() ?? ''}`}
        </Btn>
      </header>
      {exportando.activo && <Barra valor={exportando.fraction} className="absolute inset-x-0 top-0 rounded-none" />}
      <div className="flex min-h-0 flex-1 gap-5 px-6 pb-6">
        <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <Guia />
          <BarraVista panel={panel} setPanel={setPanel} />
          <Timeline />
          <Resumen />
          <Transporte />
          {preview.error && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl bg-surface p-4 text-[13px] text-danger">
              <Icono n="aviso" size={18} className="mt-0.5 shrink-0" />
              <span>{preview.error}</span>
            </div>
          )}
          {avisos.map((a) => (
            <div key={a} className="flex items-start gap-3 rounded-2xl bg-surface p-4 text-[13px] text-soft">
              <Icono n="aviso" size={18} className="mt-0.5 shrink-0 text-accent" />
              <span>{NOMBRE_AVISO[a] ?? a}</span>
            </div>
          ))}
          {!useStore.getState().guiaVista && (
            <button type="button" onClick={() => { localStorage.setItem('alargo-guia', '1'); useStore.setState({ guiaVista: true }) }} className="no-drag self-start px-1 text-[12px] text-faint underline underline-offset-4 hover:text-ink">
              Mostrar la guía otra vez
            </button>
          )}
        </section>
        {panel && (
          <aside className="w-[372px] shrink-0 overflow-y-auto rounded-3xl bg-surface px-5 py-1">
            <Inspector />
          </aside>
        )}
      </div>
    </div>
  )
}

const ZOOM_MAX = 3000
const zoomEvt = (d: { factor?: number; abs?: number; todo?: boolean }): void => void window.dispatchEvent(new CustomEvent('alargo:zoom', { detail: d }))

function BarraVista({ panel, setPanel }: { panel: boolean; setPanel: (v: boolean) => void }): JSX.Element {
  const { iman, seguir, ondaModo, alto, zoom, zoomFit, setVista, abierto } = useStore()
  const fit = Math.max(zoomFit, 0.5)
  const z = zoom > 0 ? zoom : fit
  const u = Math.max(0, Math.min(1, Math.log(z / fit) / Math.log(ZOOM_MAX / fit)))
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-soft">
      <div className="flex items-center gap-1.5" title="Cómo se pegan al arrastrar. Mantén Alt para moverlo libre.">
        <span>Imán</span>
        <Segmentado valor={iman} opciones={[{ v: 'auto', t: 'Auto', titulo: 'Cada cosa se pega a lo que le toca (compases, tiempos…)' }, { v: 'compas', t: 'Compás' }, { v: 'tiempo', t: 'Tiempo' }, { v: 'libre', t: 'Libre', titulo: 'Sin imán: precisión total' }]} onChange={(v) => setVista({ iman: v })} />
      </div>
      <div className="flex items-center gap-1.5">
        <span>Onda</span>
        <Segmentado valor={ondaModo} opciones={[{ v: 'voz', t: 'Voz', titulo: 'Voz en color e instrumental en gris' }, { v: 'frecuencias', t: 'Colores', titulo: 'Graves rojos, medios verdes y agudos azules, como en tu programa de DJ' }]} onChange={(v) => setVista({ ondaModo: v })} />
      </div>
      <button type="button" aria-pressed={seguir} title="El cursor se queda a la vista mientras suena. Si te mueves a mano, deja de seguirlo hasta que vuelvas a dar al play (S)" onClick={() => setVista({ seguir: !seguir })} className={`no-drag h-8 rounded-xl px-3 transition ${seguir ? 'bg-accent-soft font-medium text-accent' : 'bg-sunken hover:text-ink'}`}>
        Seguir el cursor
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        <button type="button" title="Alejar (−)" aria-label="Alejar" onClick={() => zoomEvt({ factor: 1 / 1.6 })} className="no-drag grid h-7 w-7 place-items-center rounded-lg bg-sunken hover:text-ink">
          <Icono n="menos" size={14} />
        </button>
        <input type="range" aria-label="Zoom" style={{ width: 110, ['--p' as string]: `${u * 100}%` }} min={0} max={1} step={0.001} value={u} onChange={(e) => zoomEvt({ abs: fit * Math.pow(ZOOM_MAX / fit, parseFloat(e.target.value)) })} />
        <button type="button" title="Acercar (+)" aria-label="Acercar" onClick={() => zoomEvt({ factor: 1.6 })} className="no-drag grid h-7 w-7 place-items-center rounded-lg bg-sunken hover:text-ink">
          <Icono n="mas" size={14} />
        </button>
        <button type="button" title="Ver toda la canción (0)" onClick={() => zoomEvt({ todo: true })} className="no-drag h-7 rounded-lg bg-sunken px-2.5 hover:text-ink">
          Todo
        </button>
        <button type="button" aria-pressed={alto > 1} title="Pistas más altas para ver mejor la onda" onClick={() => setVista({ alto: alto > 1 ? 1 : 1.7 })} className={`no-drag h-7 rounded-lg px-2.5 transition ${alto > 1 ? 'bg-accent-soft text-accent' : 'bg-sunken hover:text-ink'}`}>
          Altas
        </button>
        <button type="button" aria-pressed={!panel} title="Oculta el panel de ajustes para tener la línea de tiempo a todo el ancho (P)" onClick={() => setPanel(!panel)} className={`no-drag h-7 rounded-lg px-2.5 transition ${!panel ? 'bg-accent-soft text-accent' : 'bg-sunken hover:text-ink'}`}>
          {panel ? 'Ocultar panel' : 'Mostrar panel'}
        </button>
      </div>
      {!abierto && null}
    </div>
  )
}
