import { useState } from 'react'
import { useStore } from './store'
import type { Proyecto } from './types'
import { Barra, Btn, BtnIcono, Icono, Segmentado } from './ui'
import { fmt } from './util'

export function Cabecera({ derecha }: { derecha?: React.ReactNode }): JSX.Element {
  const irA = useStore((s) => s.irA)
  const mac = useStore((s) => s.info?.plataforma === 'darwin')
  return (
    <header className={`drag flex h-14 shrink-0 items-center justify-between pr-4 ${mac ? 'pl-24' : 'pl-6'}`}>
      <div className="display text-[22px] font-extrabold tracking-tight">Alargo</div>
      <div className="flex items-center gap-1">
        {derecha}
        <BtnIcono n="ajustes" titulo="Ajustes" onClick={() => irA('ajustes')} />
      </div>
    </header>
  )
}

function Instalador(): JSX.Element {
  const { motor, instalacion, instalar, ajustes } = useStore()
  const [calidad, setCalidad] = useState<'alta' | 'rapida'>(ajustes?.calidad ?? 'alta')
  const activa = instalacion?.activa
  return (
    <div className="mx-auto w-full max-w-[640px] rounded-3xl bg-surface p-10 shadow-[0_1px_0_var(--line)]">
      <h1 className="display text-[30px] font-bold leading-tight">Antes de empezar</h1>
      <p className="mt-3 max-w-[52ch] text-[15px] text-soft">
        Alargo trabaja con modelos de inteligencia artificial que se ejecutan en tu ordenador. Hay que descargarlos una sola vez; después funciona sin internet y sin límites.
      </p>
      <div className="mt-7 flex flex-col gap-3">
        {([
          ['alta', 'Alta calidad', 'Separa la voz con el mejor modelo disponible. Tarda más por canción.', '2,3 GB'],
          ['rapida', 'Rápida', 'Muy buena calidad y bastante más veloz, sobre todo en ordenadores sin tarjeta gráfica.', '1,7 GB']
        ] as const).map(([v, t, d, peso]) => (
          <button key={v} type="button" disabled={activa} onClick={() => setCalidad(v)} className={`flex items-start gap-4 rounded-2xl border p-4 text-left transition-colors ${calidad === v ? 'border-accent bg-accent-soft' : 'border-line hover:border-faint'}`}>
            <span className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${calidad === v ? 'border-accent' : 'border-faint'}`}>{calidad === v && <span className="h-2 w-2 rounded-full bg-accent" />}</span>
            <span className="flex-1">
              <span className="block font-semibold">{t}</span>
              <span className="block text-[13px] text-soft">{d}</span>
            </span>
            <span className="num text-[13px] text-soft">{peso}</span>
          </button>
        ))}
      </div>
      {activa ? (
        <div className="mt-8">
          <div className="mb-2 flex items-baseline justify-between text-[13px]">
            <span className="font-medium">{instalacion?.fase}</span>
            <span className="num text-soft">{Math.round((instalacion?.fraction ?? 0) * 100)} %</span>
          </div>
          <Barra valor={instalacion?.fraction ?? 0} />
          <p className="mt-2 truncate text-[12px] text-faint">{instalacion?.detalle ?? 'Puede tardar unos minutos según tu conexión.'}</p>
        </div>
      ) : (
        <div className="mt-8 flex items-center gap-4">
          <Btn variante="primario" tam="lg" icono="bajar" onClick={() => void instalar(calidad)}>
            Descargar e instalar
          </Btn>
          <span className="text-[13px] text-faint">{motor?.motorListo ? 'Faltan solo los modelos.' : 'Necesitas conexión a internet.'}</span>
        </div>
      )}
      {instalacion?.error && (
        <div role="alert" className="mt-5 rounded-xl bg-sunken p-3 text-[13px] text-danger">
          No se pudo completar: {instalacion.error}
        </div>
      )}
    </div>
  )
}

function Soltar(): JSX.Element {
  const { elegirArchivos, ajustes, irA } = useStore()
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col items-center rounded-[28px] border-2 border-dashed border-line px-10 py-14 text-center transition-colors">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icono n="nota" size={26} />
      </div>
      <h1 className="display mt-6 text-[34px] font-bold leading-tight">Suelta una canción para alargarla</h1>
      <p className="mt-3 max-w-[50ch] text-[15px] text-soft">
        Alargo añade una intro instrumental con ritmo para mezclar y deja el último estribillo en acapela. Después lo ajustas todo a tu gusto.
      </p>
      <div className="mt-7 flex items-center gap-3">
        <Btn variante="primario" tam="lg" onClick={() => void elegirArchivos()}>
          Elegir archivos
        </Btn>
        <button type="button" onClick={() => irA('ajustes')} className="no-drag text-[13px] text-soft underline-offset-4 hover:text-ink hover:underline">
          Calidad {ajustes?.calidad === 'alta' ? 'alta' : 'rápida'}
        </button>
      </div>
      <p className="mt-6 text-[12px] text-faint">MP3, WAV, FLAC, M4A, OGG y más. Todo ocurre en tu ordenador.</p>
    </div>
  )
}

function Fila({ p }: { p: Proyecto }): JSX.Element {
  const { abrir } = useStore()
  const [confirmar, setConfirmar] = useState(false)
  const api = window.api.proyectos
  const listo = p.estado === 'listo'
  return (
    <li className="group relative">
      <div role={listo ? 'button' : undefined} tabIndex={listo ? 0 : -1} onClick={() => listo && void abrir(p.id)} onKeyDown={(e) => listo && (e.key === 'Enter' || e.key === ' ') && void abrir(p.id)} className={`flex items-center gap-4 rounded-2xl px-4 py-3 transition-colors ${listo ? 'cursor-pointer hover:bg-surface' : ''}`}>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-soft">
          <Icono n="nota" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{p.titulo || 'Sin título'}</div>
          <div className="truncate text-[13px] text-soft">
            {p.estado === 'error' ? <span className="text-danger">{p.error}</span> : p.estado === 'listo' ? p.artista || 'Artista desconocido' : (p.estado === 'en_cola' ? 'En cola' : p.etapa || 'Analizando') + (p.estado === 'analizando' ? '…' : '')}
          </div>
          {(p.estado === 'analizando' || p.estado === 'en_cola') && <Barra valor={p.progreso ?? 0} className="mt-2 max-w-[360px]" />}
        </div>
        {listo && (
          <div className="num hidden text-right text-[13px] text-soft sm:block">
            <div>{Math.round(p.bpm ?? 0)} BPM</div>
            <div>{fmt(p.duracion_s ?? 0)}</div>
          </div>
        )}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {p.estado === 'error' && <Btn tam="sm" icono="repetir" onClick={() => void api.reintentar(p.id).then((r: { ok: boolean; error?: string }) => !r.ok && useStore.getState().avisar(r.error ?? 'No se pudo reintentar', 'error'))}>Reintentar</Btn>}
          {(p.estado === 'analizando' || p.estado === 'en_cola') && <Btn tam="sm" variante="fantasma" onClick={() => void api.cancelar(p.id)}>Cancelar</Btn>}
          {listo && <Icono n="derecha" size={16} className="text-faint transition-transform group-hover:translate-x-0.5" />}
          {p.estado !== 'analizando' && p.estado !== 'en_cola' && (confirmar ? (
            <Btn tam="sm" variante="peligro" onClick={() => void api.borrar(p.id)}>¿Quitar y borrar pistas?</Btn>
          ) : (
            <BtnIcono n="papelera" titulo="Quitar de la biblioteca" onClick={() => { setConfirmar(true); window.setTimeout(() => setConfirmar(false), 3500) }} />
          ))}
        </div>
      </div>
    </li>
  )
}

export function Biblioteca(): JSX.Element {
  const { proyectos, motor } = useStore()
  const listoMotor = !!motor && motor.motorListo && motor.faltan.length === 0
  return (
    <div className="flex h-full flex-col">
      <Cabecera />
      <main className="flex-1 overflow-y-auto px-8 pb-10">
        <div className="mx-auto max-w-[860px]">
          {!motor ? null : listoMotor ? <Soltar /> : <Instalador />}
          {proyectos.length > 0 && (
            <section className="mt-12">
              <h2 className="display mb-2 px-4 text-[18px] font-semibold">Tus canciones</h2>
              <ul>{proyectos.map((p) => <Fila key={p.id} p={p} />)}</ul>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

export { Segmentado }
