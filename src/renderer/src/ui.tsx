import { useEffect, useState, type ReactNode } from 'react'
import { fmtMs, leerTiempo } from './util'

const RUTAS: Record<string, string> = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z',
  atras: 'M15 5l-7 7 7 7',
  deshacer: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  rehacer: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  mas: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  cerrar: 'M6 6l12 12M18 6L6 18',
  carpeta: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  ajustes: 'M4 8h10M18 8h2M4 16h2M10 16h10M16 6v4M8 14v4',
  bajar: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
  papelera: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  repetir: 'M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5',
  nota: 'M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z',
  derecha: 'M9 5l7 7-7 7',
  ok: 'M5 12.5l4.5 4.5L19 7.5',
  aviso: 'M12 8v5m0 3.5v.01M10.3 4.2L3 17a2 2 0 001.7 3h14.6a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z',
  ojo: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  union: 'M5 12h4m6 0h4M12 7v10',
  inicio: 'M6 5v14M19 5l-10 7 10 7',
  final: 'M18 5v14M5 5l10 7-10 7',
  atras5: 'M11 6l-6 6 6 6M19 6l-6 6 6 6',
  adelante5: 'M13 6l6 6-6 6M5 6l6 6-6 6',
  volumen: 'M4 10v4h4l5 4V6l-5 4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11',
  silencio: 'M4 10v4h4l5 4V6l-5 4zM17 9l4 6M21 9l-4 6',
  teclado: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
  ayuda: 'M9.5 9a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 4M12 17v.01'
}

export function Icono({ n, size = 18, className = '', trazo = 1.7 }: { n: keyof typeof RUTAS | string; size?: number; className?: string; trazo?: number }): JSX.Element {
  const relleno = n === 'play' || n === 'pause'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={relleno ? 'currentColor' : 'none'} stroke={relleno ? 'none' : 'currentColor'} strokeWidth={trazo} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={RUTAS[n]} />
    </svg>
  )
}

type BtnProps = {
  children?: ReactNode
  onClick?: () => void
  variante?: 'primario' | 'suave' | 'fantasma' | 'peligro'
  disabled?: boolean
  icono?: string
  titulo?: string
  className?: string
  tam?: 'sm' | 'md' | 'lg'
}
export function Btn({ children, onClick, variante = 'suave', disabled, icono, titulo, className = '', tam = 'md' }: BtnProps): JSX.Element {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none no-drag select-none whitespace-nowrap'
  const tams = { sm: 'h-8 px-3 text-[13px]', md: 'h-9 px-4', lg: 'h-11 px-6 text-[15px]' }[tam]
  const vars = {
    primario: 'bg-accent text-accent-ink hover:brightness-110',
    suave: 'bg-sunken text-ink hover:bg-line',
    fantasma: 'text-soft hover:text-ink hover:bg-sunken',
    peligro: 'bg-sunken text-danger hover:bg-line'
  }[variante]
  return (
    <button type="button" title={titulo} aria-label={titulo} disabled={disabled} onClick={onClick} className={`${base} ${tams} ${vars} ${className}`}>
      {icono && <Icono n={icono} size={tam === 'sm' ? 15 : 17} />}
      {children}
    </button>
  )
}

export function BtnIcono({ n, onClick, titulo, disabled, activo }: { n: string; onClick?: () => void; titulo: string; disabled?: boolean; activo?: boolean }): JSX.Element {
  return (
    <button type="button" title={titulo} aria-label={titulo} disabled={disabled} onClick={onClick} className={`no-drag grid h-9 w-9 place-items-center rounded-xl transition-colors disabled:opacity-30 disabled:pointer-events-none ${activo ? 'bg-accent-soft text-accent' : 'text-soft hover:bg-sunken hover:text-ink'}`}>
      <Icono n={n} />
    </button>
  )
}

export function Segmentado<T extends string | number>({ valor, opciones, onChange, ancho }: { valor: T; opciones: { v: T; t: string; titulo?: string }[]; onChange: (v: T) => void; ancho?: boolean }): JSX.Element {
  return (
    <div role="radiogroup" className={`inline-flex rounded-xl bg-sunken p-0.5 ${ancho ? 'w-full' : ''}`}>
      {opciones.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === valor} title={o.titulo} onClick={() => onChange(o.v)} className={`h-8 rounded-[10px] px-3 text-[13px] transition-colors ${ancho ? 'flex-1' : ''} ${o.v === valor ? 'bg-surface text-ink shadow-sm font-medium' : 'text-soft hover:text-ink'}`}>
          {o.t}
        </button>
      ))}
    </div>
  )
}

export function Interruptor({ valor, onChange, etiqueta }: { valor: boolean; onChange: (v: boolean) => void; etiqueta: string }): JSX.Element {
  return (
    <button type="button" role="switch" aria-checked={valor} aria-label={etiqueta} onClick={() => onChange(!valor)} className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${valor ? 'bg-accent' : 'bg-line'}`}>
      <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${valor ? 'left-[19px]' : 'left-[3px]'}`} />
    </button>
  )
}

export function Fila({ etiqueta, ayuda, children, apilada }: { etiqueta: string; ayuda?: string; children: ReactNode; apilada?: boolean }): JSX.Element {
  if (apilada)
    return (
      <div className="py-1.5">
        <div className="text-[13px]">{etiqueta}</div>
        {ayuda && <div className="mb-1.5 text-[12px] leading-snug text-faint">{ayuda}</div>}
        {children}
      </div>
    )
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-[13px]">{etiqueta}</div>
        {ayuda && <div className="text-[12px] leading-snug text-faint">{ayuda}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Deslizador({ etiqueta, valor, min, max, paso = 1, unidad, onChange, formato, ayuda }: { etiqueta: string; valor: number; min: number; max: number; paso?: number; unidad?: string; onChange: (v: number) => void; formato?: (v: number) => string; ayuda?: string }): JSX.Element {
  const p = ((valor - min) / (max - min)) * 100
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px]">{etiqueta}</span>
        <span className="num text-[13px] text-soft">{formato ? formato(valor) : `${valor}${unidad ?? ''}`}</span>
      </div>
      <input type="range" aria-label={etiqueta} min={min} max={max} step={paso} value={valor} style={{ ['--p' as string]: `${p}%` }} onChange={(e) => onChange(parseFloat(e.target.value))} onDoubleClick={() => onChange(min <= 0 && max >= 0 ? 0 : valor)} />
      {ayuda && <div className="-mt-1 text-[12px] leading-snug text-faint">{ayuda}</div>}
    </div>
  )
}

export function Seccion({ titulo, resumen, children, abierta = false, derecha, descripcion }: { titulo: string; resumen?: string; children: ReactNode; abierta?: boolean; derecha?: ReactNode; descripcion?: string }): JSX.Element {
  const [open, setOpen] = useState(abierta)
  return (
    <section className="border-b border-line last:border-0">
      <div className="flex items-center gap-2 py-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="no-drag flex min-w-0 flex-1 items-center gap-2 text-left">
          <Icono n="derecha" size={14} className={`shrink-0 text-faint transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="display text-[15px] font-semibold">{titulo}</span>
          {resumen && !open && <span className="truncate text-[12px] text-faint">{resumen}</span>}
        </button>
        {derecha}
      </div>
      {open && (
        <div className="pb-4 pl-[22px]">
          {descripcion && <p className="mb-3 text-[12px] leading-snug text-soft">{descripcion}</p>}
          {children}
        </div>
      )}
    </section>
  )
}

export function Barra({ valor, className = '' }: { valor: number; className?: string }): JSX.Element {
  return (
    <div className={`h-[3px] w-full overflow-hidden rounded-full bg-line ${className}`}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(Math.min(1, Math.max(0, valor)) * 100)}%` }} />
    </div>
  )
}

export function Chip({ children, activo, onClick, titulo }: { children: ReactNode; activo?: boolean; onClick?: () => void; titulo?: string }): JSX.Element {
  return (
    <button type="button" title={titulo} onClick={onClick} className={`num h-7 rounded-lg px-2.5 text-[12px] transition-colors ${activo ? 'bg-accent-soft text-accent font-medium' : 'bg-sunken text-soft hover:text-ink'}`}>
      {children}
    </button>
  )
}

/** Botones − / + con valor central, para ajustes finos. */
export function Ajuste({ pasos, onPaso, texto }: { pasos: { t: string; d: number }[]; onPaso: (d: number) => void; texto?: string }): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      {pasos.filter((p) => p.d < 0).map((p) => (
        <button key={p.t} type="button" onClick={() => onPaso(p.d)} className="num h-7 min-w-8 rounded-lg bg-sunken px-2 text-[12px] text-soft hover:text-ink">
          {p.t}
        </button>
      ))}
      {texto && <span className="num mx-1 min-w-[58px] text-center text-[13px]">{texto}</span>}
      {pasos.filter((p) => p.d > 0).map((p) => (
        <button key={p.t} type="button" onClick={() => onPaso(p.d)} className="num h-7 min-w-8 rounded-lg bg-sunken px-2 text-[12px] text-soft hover:text-ink">
          {p.t}
        </button>
      ))}
    </div>
  )
}

/** Hora exacta editable: escribe «1:23.456» o usa ↑ ↓ (1 ms; con Mayús 10 ms; con Alt 100 ms). */
export function CampoTiempo({ valor, onChange, etiqueta }: { valor: number; onChange: (t: number) => void; etiqueta: string }): JSX.Element {
  const [txt, setTxt] = useState(fmtMs(valor))
  const [editando, setEditando] = useState(false)
  useEffect(() => {
    if (!editando) setTxt(fmtMs(valor))
  }, [valor, editando])
  const aplicar = (): void => {
    const t = leerTiempo(txt)
    if (t !== null && Math.abs(t - valor) > 1e-6) onChange(Math.max(0, t))
    setEditando(false)
    setTxt(fmtMs(t ?? valor))
  }
  return (
    <input
      aria-label={etiqueta}
      title="Escribe la hora exacta (por ejemplo 1:23.456) o usa ↑ ↓: 1 ms (Mayús 10 ms, Alt 100 ms)"
      value={txt}
      onFocus={(e) => {
        setEditando(true)
        e.currentTarget.select()
      }}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        else if (e.key === 'Escape') {
          setTxt(fmtMs(valor))
          setEditando(false)
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          const paso = (e.altKey ? 0.1 : e.shiftKey ? 0.01 : 0.001) * (e.key === 'ArrowUp' ? 1 : -1)
          const base = leerTiempo(txt) ?? valor
          const n = Math.max(0, base + paso)
          setTxt(fmtMs(n))
          onChange(n)
        }
      }}
      className="num no-drag h-8 w-[108px] rounded-lg bg-sunken px-2 text-[13px] outline-none focus:ring-2 focus:ring-accent"
    />
  )
}
