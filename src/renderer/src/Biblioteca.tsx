import { useEffect, useState } from 'react'
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

function Soltar({ compacto }: { compacto?: boolean }): JSX.Element {
  const { elegirArchivos, ajustes, irA } = useStore()
  return (
    <div className={`mx-auto flex w-full max-w-[760px] flex-col items-center rounded-[28px] border-2 border-dashed border-line px-10 text-center transition-colors ${compacto ? 'py-8' : 'py-14'}`}>
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icono n="nota" size={26} />
      </div>
      <h1 className="display mt-6 text-[34px] font-bold leading-tight">Suelta una canción para alargarla</h1>
      <p className={`mt-3 max-w-[50ch] text-[15px] text-soft ${compacto ? 'hidden' : ''}`}>
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


const PASOS_ALTA = [
  { t: 'Preparar el audio', d: 'Se convierte la canción a un formato de trabajo.' },
  { t: 'Separar el ritmo y el bajo', d: 'La IA aísla la batería y el bajo para poder hacer la intro con ritmo.' },
  { t: 'Separar la voz', d: 'La IA aísla la voz del resto. Es el paso más largo y el que da la mejor calidad para la acapela.' },
  { t: 'Buscar el ritmo y la estructura', d: 'Se detectan el tempo, los compases, dónde entra la voz y cuál es el último estribillo.' }
]
const PASOS_RAPIDA = [PASOS_ALTA[0], { t: 'Separar las pistas', d: 'La IA separa la voz, la batería, el bajo y el resto de la canción.' }, PASOS_ALTA[3]]

function indicePaso(etapa: string | undefined, alta: boolean): number {
  const e = (etapa ?? '').toLowerCase()
  if (e.includes('preparando')) return 0
  if (e.includes('separando la voz')) return 2
  if (e.includes('separando')) return 1
  return alta ? 3 : 2
}

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Analizando({ p, posicion }: { p: Proyecto; posicion: number }): JSX.Element {
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const alta = p.calidad === 'alta'
  const pasos = alta ? PASOS_ALTA : PASOS_RAPIDA
  const enCola = p.estado === 'en_cola'
  const i = enCola ? -1 : indicePaso(p.etapa, alta)
  const frac = p.progreso ?? 0
  const transcurrido = p.inicio ? ahora - p.inicio : 0
  const restante = !enCola && frac > 0.08 && p.inicio ? (transcurrido / frac) * (1 - frac) : null
  return (
    <div className="rounded-3xl bg-surface p-7 shadow-[0_1px_0_var(--line)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-accent">
            <span className="pulso inline-block h-2 w-2 rounded-full bg-accent" />
            {enCola ? `En cola (${posicion} por delante)` : 'Analizando con inteligencia artificial'}
          </div>
          <h2 className="display mt-1 truncate text-[24px] font-bold leading-tight">{p.titulo || 'Canción'}</h2>
          {p.artista && <div className="truncate text-[13px] text-soft">{p.artista}</div>}
        </div>
        <Btn tam="sm" variante="fantasma" onClick={() => void window.api.proyectos.cancelar(p.id)}>Cancelar</Btn>
      </div>

      {!enCola && (
        <>
          <div className="mt-6 flex items-baseline justify-between text-[13px]">
            <span className="font-medium">{pasos[i]?.t}…</span>
            <span className="num text-soft">{Math.round(frac * 100)} %</span>
          </div>
          <Barra valor={frac} className="mt-2" />
          <div className="num mt-2 flex flex-wrap gap-x-5 text-[12px] text-faint">
            <span>Llevamos {mmss(transcurrido)}</span>
            {restante !== null && <span>Quedan unos {restante < 90000 ? 'segundos' : `${Math.max(1, Math.round(restante / 60000))} min`} (aproximado)</span>}
          </div>
          <ol className="mt-6 grid gap-3">
            {pasos.map((x, k) => (
              <li key={x.t} className={`flex gap-3 ${k > i ? 'opacity-45' : ''}`}>
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${k < i ? 'bg-accent text-accent-ink' : k === i ? 'border-2 border-accent text-accent' : 'border border-faint text-faint'}`}>
                  {k < i ? <Icono n="ok" size={12} trazo={2.4} /> : k + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[14px] ${k === i ? 'font-semibold' : ''}`}>{x.t}</span>
                  {k === i && <span className="block text-[13px] leading-snug text-soft">{x.d}</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="mt-6 rounded-2xl bg-sunken px-4 py-3 text-[13px] leading-relaxed text-soft">
        {alta
          ? 'Es normal que tarde varios minutos por canción: la calidad alta trabaja con modelos muy grandes. No se ha colgado.'
          : 'Es normal que tarde unos minutos por canción. No se ha colgado.'}{' '}
        Puedes usar otras apps mientras tanto, pero no cierres Alargo. Sólo se hace una vez por canción: después, editar y escuchar es instantáneo.
      </p>
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
  const enCurso = proyectos.filter((p) => p.estado === 'analizando' || p.estado === 'en_cola').sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'analizando' ? -1 : 1))
  const resto = proyectos.filter((p) => p.estado !== 'analizando' && p.estado !== 'en_cola')
  return (
    <div className="flex h-full flex-col">
      <Cabecera />
      <main className="flex-1 overflow-y-auto px-8 pb-10">
        <div className="mx-auto max-w-[860px]">
          {enCurso.length > 0 && (
            <div className="mb-8 grid gap-4">
              {enCurso.map((p, k) => (
                <Analizando key={p.id} p={p} posicion={Math.max(0, k)} />
              ))}
            </div>
          )}
          {!motor ? null : listoMotor ? <Soltar compacto={enCurso.length > 0} /> : <Instalador />}
          {resto.length > 0 && (
            <section className="mt-12">
              <h2 className="display mb-2 px-4 text-[18px] font-semibold">Tus canciones</h2>
              <ul>{resto.map((p) => <Fila key={p.id} p={p} />)}</ul>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

export { Segmentado }
