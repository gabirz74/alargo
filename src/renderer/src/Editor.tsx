import { useEffect, useState } from 'react'
import { audio } from './audio'
import { Inspector } from './Inspector'
import { Timeline } from './Timeline'
import { useStore } from './store'
import { Barra, Btn, BtnIcono, Icono, Segmentado } from './ui'
import { fmt, NOMBRE_AVISO } from './util'

function Reloj(): JSX.Element {
  const [t, setT] = useState(0)
  const dur = useStore((s) => (audio.modo === 'resultado' ? s.preview.info?.duracion_s : s.abierto?.analisis.duracion_s) ?? 0)
  useEffect(() => {
    let raf = 0
    let ultimo = 0
    const f = (n: number): void => {
      raf = requestAnimationFrame(f)
      if (n - ultimo > 60) {
        ultimo = n
        setT(audio.tiempo)
      }
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <span className="num text-[15px]">
      {fmt(t, true)} <span className="text-faint">/ {fmt(dur)}</span>
    </span>
  )
}

function Zoom(): JSX.Element {
  const zoom = useStore((s) => s.zoom)
  const setZoom = useStore((s) => s.setZoom)
  return (
    <div className="absolute right-1 top-0 z-10 flex items-center gap-0.5 rounded-lg bg-bg">
      <button type="button" title="Ver toda la canción" aria-label="Ver toda la canción" onClick={() => setZoom(0)} className="no-drag grid h-6 w-6 place-items-center rounded-md text-soft hover:bg-sunken hover:text-ink">
        <Icono n="menos" size={14} />
      </button>
      <button type="button" title="Acercar" aria-label="Acercar" onClick={() => setZoom(Math.max(20, (zoom || 4) * 1.8))} className="no-drag grid h-6 w-6 place-items-center rounded-md text-soft hover:bg-sunken hover:text-ink">
        <Icono n="mas" size={14} />
      </button>
    </div>
  )
}

function Transporte(): JSX.Element {
  const preview = useStore((s) => s.preview)
  const [, forzar] = useState(0)
  const info = preview.info
  const modo = audio.modo
  const sonando = audio.sonando
  useEffect(() => {
    const a = [audio.resultado, audio.original]
    const h = (): void => forzar((n) => n + 1)
    a.forEach((x) => ['play', 'pause', 'ended'].forEach((ev) => x.addEventListener(ev, h)))
    return () => a.forEach((x) => ['play', 'pause', 'ended'].forEach((ev) => x.removeEventListener(ev, h)))
  }, [])

  const uniones = info?.segmentos.slice(1).map((s) => ({ t: s.ini, tipo: s.tipo })) ?? []
  const etiqueta = (tipo: string): string => (tipo === 'cancion' ? 'Intro → canción' : 'Canción → acapela')

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-surface px-4 py-3">
      <button type="button" aria-label={sonando ? 'Pausar' : 'Reproducir'} onClick={() => { audio.alternar(); forzar((n) => n + 1) }} className="no-drag grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-ink transition hover:brightness-110">
        <Icono n={sonando ? 'pause' : 'play'} size={20} />
      </button>
      <Reloj />
      <Segmentado valor={modo} opciones={[{ v: 'resultado', t: 'Tu extended' }, { v: 'original', t: 'Original' }]} onChange={(v) => { audio.usar(v); forzar((n) => n + 1) }} />
      <div className="mx-1 hidden h-6 w-px bg-line md:block" />
      <div className="flex items-center gap-2">
        {uniones.map((u) => (
          <Btn key={u.tipo} tam="sm" icono="union" titulo="Escucha solo el empalme" onClick={() => { audio.tramo(u.t - 5, u.t + 6); forzar((n) => n + 1) }}>
            {etiqueta(u.tipo)}
          </Btn>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {preview.renderizando && <span className="pulso text-[12px] text-faint">Actualizando…</span>}
      </div>
    </div>
  )
}

export function Editor(): JSX.Element {
  const { abierto, cerrar, deshacer, rehacer, restablecer, preview, exportar, exportando, ajustes, info } = useStore()
  const mac = info?.plataforma === 'darwin'

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      const escribiendo = t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text'
      if (escribiendo) return
      const mod = e.metaKey || e.ctrlKey
      if (e.code === 'Space') {
        e.preventDefault()
        audio.alternar()
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) rehacer()
        else deshacer()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        rehacer()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [deshacer, rehacer])

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
        <div className="ml-1 min-w-0">
          <div className="display truncate text-[17px] font-semibold leading-tight">{an.titulo || proyecto.titulo}</div>
          <div className="truncate text-[12px] leading-tight text-soft">
            {an.artista || 'Artista desconocido'} · <span className="num">{an.bpm.toString().replace('.', ',')} BPM</span>
          </div>
        </div>
        <div className="flex-1" />
        <BtnIcono n="deshacer" titulo="Deshacer" onClick={deshacer} disabled={!d.length} />
        <BtnIcono n="rehacer" titulo="Rehacer" onClick={rehacer} disabled={!r.length} />
        <Btn variante="fantasma" tam="sm" icono="repetir" onClick={restablecer} titulo="Volver a la sugerencia de la IA">
          Sugerencia IA
        </Btn>
        <Btn variante="primario" icono="bajar" className="ml-2" disabled={exportando.activo || !preview.info} onClick={() => void exportar()}>
          {exportando.activo ? 'Exportando…' : `Exportar ${ajustes?.formato.toUpperCase() ?? ''}`}
        </Btn>
      </header>
      {exportando.activo && <Barra valor={exportando.fraction} className="absolute inset-x-0 top-0 rounded-none" />}
      <div className="flex min-h-0 flex-1 gap-5 px-6 pb-6">
        <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div className="relative">
            <Zoom />
            <Timeline />
          </div>
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
          <p className="px-1 text-[12px] leading-relaxed text-faint">
            Arrastra la <b className="font-medium text-soft">intro</b> y la <b className="font-medium text-soft">acapela</b> por la canción (se pegan a los compases). Arrastra «Entra la voz» para elegir dónde retoma la canción. Haz clic en cualquier punto para escuchar desde ahí. Espacio reproduce y pausa; con Ctrl o Cmd + rueda haces zoom.
          </p>
        </section>
        <aside className="w-[372px] shrink-0 overflow-y-auto rounded-3xl bg-surface px-5 py-1">
          <Inspector />
        </aside>
      </div>
    </div>
  )
}
