import { useStore } from './store'
import type { Fuente } from './types'
import { Ajuste, Btn, CampoTiempo, Chip, Deslizador, Fila, Interruptor, Segmentado, Seccion } from './ui'
import type { Capa, Efectos } from './types'
import { aBruto, aPantalla, barK, barNumber, barTime, fmt, normalizarCortes, T4 } from './util'

const sgn = (v: number, d = 1): string => (v > 0 ? '+' : '') + v.toFixed(d).replace('.', ',')


function Efecto({ titulo, ayuda, on, onChange, children }: { titulo: string; ayuda: string; on: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }): JSX.Element {
  return (
    <div className="border-t border-line py-2.5 first:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium">{titulo}</div>
          <div className="text-[12px] leading-snug text-faint">{ayuda}</div>
        </div>
        <Interruptor etiqueta={titulo} valor={on} onChange={onChange} />
      </div>
      {on && children && <div className="mt-2 pl-1">{children}</div>}
    </div>
  )
}

function PortadaVista({ id, marca }: { id: string; marca: boolean }): JSX.Element {
  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-sunken">
      <img src={`media://p/${id}/pistas/portada.jpg`} alt="Portada" className="h-full w-full object-cover" draggable={false} />
      {marca && (
        <div className="absolute inset-x-0 bottom-0 flex h-[13%] items-center justify-center border-t border-[#6e76ff] bg-[rgba(8,10,20,0.75)] text-[7px] font-bold tracking-[0.25em] text-white">EXTENDED</div>
      )}
    </div>
  )
}


function CapaFila({ nombre, ayuda, capa, fuente, onChange }: { nombre: string; ayuda: string; capa: Capa; fuente: number; onChange: (f: (c: Capa) => void, clave?: string) => void }): JSX.Element {
  const ab = useStore((s) => s.abierto)
  if (!ab) return <></>
  const an = ab.analisis
  const k0 = barK(an, capa.desde_s ?? fuente)
  return (
    <div className="border-t border-line py-2.5 first:border-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium">{nombre}</div>
          <div className="text-[12px] leading-snug text-faint">{ayuda}</div>
        </div>
        <Interruptor etiqueta={nombre} valor={capa.on} onChange={(v) => onChange((c) => void (c.on = v))} />
      </div>
      {capa.on && (
        <div className="mt-2 pl-1">
          <Deslizador etiqueta="Volumen" valor={capa.nivel_db} min={-24} max={6} paso={0.5} formato={(v) => `${v > 0 ? '+' : ''}${v} dB`} onChange={(v) => onChange((c) => void (c.nivel_db = v), 'capa-' + nombre)} />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-soft">{capa.desde_s === null ? 'Del mismo trozo' : `Del compás ${barNumber(an, k0)} (${fmt(capa.desde_s)})`}</span>
            <div className="flex items-center gap-1">
              <Ajuste pasos={[{ t: '−8', d: -8 }, { t: '−1', d: -1 }, { t: '+1', d: 1 }, { t: '+8', d: 8 }]} onPaso={(d) => onChange((c) => void (c.desde_s = barTime(an, barK(an, c.desde_s ?? fuente) + d)))} />
              {capa.desde_s !== null && <Chip onClick={() => onChange((c) => void (c.desde_s = null))}>Igual</Chip>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Acciones({ onEscuchar, onRestablecer }: { onEscuchar?: () => void; onRestablecer: () => void }): JSX.Element {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {onEscuchar && (
        <Btn tam="sm" icono="play" onClick={onEscuchar} titulo="Escucha el empalme afectado por esta sección">
          Escuchar el empalme
        </Btn>
      )}
      <Btn tam="sm" variante="fantasma" icono="repetir" onClick={onRestablecer} titulo="Devuelve esta sección a lo que propuso la IA">
        Restablecer
      </Btn>
    </div>
  )
}

export function Inspector(): JSX.Element | null {
  const ab = useStore((s) => s.abierto)
  const info = useStore((s) => s.preview.info)
  const cambiar = useStore((s) => s.cambiar)
  const moverRejilla = useStore((s) => s.moverRejilla)
  const reiniciarRejilla = useStore((s) => s.reiniciarRejilla)
  const escuchar = useStore((s) => s.escucharZona)
  const restablecerSeccion = useStore((s) => s.restablecerSeccion)
  const fxPresets = useStore((s) => s.fxPresets)
  const ajustes = useStore((s) => s.ajustes)
  const seleccionando = useStore((s) => s.seleccionando)
  const setSeleccionando = useStore((s) => s.setSeleccionando)
  const elegirTrozo = useStore((s) => s.elegirTrozo)
  const moverEntrada = useStore((s) => s.moverEntrada)
  const anadirCorte = useStore((s) => s.anadirCorte)
  const quitarCorte = useStore((s) => s.quitarCorte)
  const escucharCorte = useStore((s) => s.escucharCorte)
  const guardarAjustes = useStore((s) => s.guardarAjustes)
  if (!ab) return null
  const { edicion: e, analisis: an } = ab
  const T = an.grid.T
  const t4 = T4(an)
  const it = e.intro
  const ac = e.acapela

  const setFx = (f: (x: Efectos) => void, clave?: string): void =>
    cambiar((x) => {
      f(x.fx)
      x.fx.preset = 'personalizado'
    }, clave)
  const fuenteIntro = e.intro.fuente_s ?? e.intro.start_s
  const kFuente = barK(an, fuenteIntro)
  const anacrusa = (it.start_s - e.song.start_s) / T
  const cercanas = an.entradas_voz.filter(([t, gap]) => t > e.song.start_s - 3 * t4 && t < e.song.start_s + 3 * t4 && gap >= 0.1).slice(0, 6)
  const kAc = ac.start_s !== null ? barK(an, ac.start_s) : 0

  return (
    <div>
      <Seccion titulo="Intro" descripcion="Un tramo instrumental con ritmo antes de que entre la canción, para poder mezclarla. El bloque gris de la pista de arriba es el trozo que se usa." resumen={it.enabled ? `${it.bars} compases` : 'Apagada'} derecha={<Interruptor etiqueta="Intro" valor={it.enabled} onChange={(v) => cambiar((x) => void (x.intro.enabled = v))} />}>
        {it.enabled && (
          <>
            <Acciones onEscuchar={() => escuchar('intro')} onRestablecer={() => restablecerSeccion('intro')} />
            <Fila apilada etiqueta="Sonido" ayuda={e.intro.capas.on ? 'Ahora mandan las capas de «Qué suena en la intro».' : 'Qué se oye en la intro.'}>
              <Segmentado<Fuente> valor={it.source} opciones={[{ v: 'inst', t: 'Completo', titulo: 'Todo el instrumental' }, { v: 'drums', t: 'Batería' }, { v: 'drums_bass', t: 'Bat. + bajo' }]} onChange={(v) => cambiar((x) => void (x.intro.source = v))} />
            </Fila>
            <Fila etiqueta="Duración" ayuda="En compases (4 tiempos cada uno).">
              <Segmentado valor={it.bars} opciones={[4, 8, 12, 16].map((n) => ({ v: n, t: String(n) }))} onChange={(v) => cambiar((x) => void (x.intro.bars = v))} />
            </Fila>
            <Fila apilada etiqueta="Repetir en bucle" ayuda="Repite los primeros compases hasta llenar la intro.">
              <Segmentado valor={it.loop_bars} opciones={[{ v: 0, t: 'No' }, { v: 1, t: '1' }, { v: 2, t: '2' }, { v: 4, t: '4' }]} onChange={(v) => cambiar((x) => void (x.intro.loop_bars = v))} />
            </Fila>

            <div className="mt-3 border-t border-line pt-3">
              <Fila etiqueta="Igualar volumen" ayuda="Sube o baja la intro hasta sonar como la canción.">
                <Interruptor etiqueta="Igualar volumen" valor={it.level_match} onChange={(v) => cambiar((x) => void (x.intro.level_match = v))} />
              </Fila>
              <Deslizador etiqueta="Volumen extra" valor={it.gain_db} min={-12} max={12} paso={0.5} formato={(v) => `${sgn(v)} dB`} onChange={(v) => cambiar((x) => void (x.intro.gain_db = v), 'g-intro')} ayuda="Doble clic para volver a 0." />
              <Deslizador etiqueta="Entrada suave" valor={it.fade_in_ms} min={0} max={2000} paso={50} formato={(v) => (v === 0 ? 'Sin fundido' : `${v} ms`)} onChange={(v) => cambiar((x) => void (x.intro.fade_in_ms = v), 'f-intro')} />
              <Fila etiqueta="Añadir compás si es corta" ayuda={info?.intro ? `Ahora hay ${info.intro.tiempos.toString().replace('.', ',')} tiempos de ritmo antes de la voz.` : undefined}>
                <Interruptor etiqueta="Añadir compás automáticamente" valor={it.auto_extra} onChange={(v) => cambiar((x) => void (x.intro.auto_extra = v))} />
              </Fila>
              {!it.auto_extra && (
                <>
                  <Fila etiqueta="Compases extra antes">
                    <Segmentado valor={it.extra_pre} opciones={[0, 1, 2].map((n) => ({ v: n, t: String(n) }))} onChange={(v) => cambiar((x) => void (x.intro.extra_pre = v))} />
                  </Fila>
                  <Fila etiqueta="Compases extra después">
                    <Segmentado valor={it.extra_post} opciones={[0, 1, 2].map((n) => ({ v: n, t: String(n) }))} onChange={(v) => cambiar((x) => void (x.intro.extra_post = v))} />
                  </Fila>
                </>
              )}
            </div>
          </>
        )}
        {!it.enabled && <p className="text-[12px] text-faint">Sin intro, el extended empieza donde retoma la canción.</p>}
      </Seccion>

      <Seccion titulo="Qué suena en la intro" resumen={e.intro.capas.on ? 'Por capas' : e.intro.fuente_s !== null ? `Trozo elegido (compás ${barNumber(an, barK(an, e.intro.fuente_s))})` : 'Propuesta de la IA'}
        descripcion="La IA elige el trozo que usa de intro, pero la melodía que más te gusta puede estar en otra parte. Elige tú qué compases suenan al principio, o mezcla la batería, el bajo y la melodía de partes distintas.">
        <div className="mb-3 flex flex-wrap gap-2">
          <Btn tam="sm" icono="play" onClick={() => escuchar('introTodo')} titulo="Escucha la intro desde el principio">Escuchar la intro entera</Btn>
          <Btn tam="sm" variante={seleccionando === 'intro' ? 'primario' : 'suave'} onClick={() => setSeleccionando(seleccionando === 'intro' ? false : 'intro')} titulo="Arrastra sobre la canción de arriba para marcar el trozo">
            {seleccionando === 'intro' ? 'Arrastra sobre la canción…' : 'Elegir con el ratón'}
          </Btn>
          {e.intro.fuente_s !== null && <Btn tam="sm" variante="fantasma" icono="repetir" onClick={() => elegirTrozo(null)}>Volver al de la IA</Btn>}
        </div>
        <Fila apilada etiqueta="Trozo que suena" ayuda={`Empieza en el compás ${barNumber(an, kFuente)}. Cuenta ${it.bars} compases.`}>
          <div className="flex flex-wrap items-center gap-2">
            <Ajuste pasos={[{ t: '−8', d: -8 }, { t: '−1', d: -1 }, { t: '+1', d: 1 }, { t: '+8', d: 8 }]} onPaso={(d) => elegirTrozo(barTime(an, kFuente + d))} />
            <CampoTiempo etiqueta="Hora exacta del trozo" valor={fuenteIntro} onChange={(t) => elegirTrozo(t)} />
          </div>
        </Fila>
        {(an.melodias?.length ?? 0) > 0 && (
          <div className="mt-2">
            <div className="mb-1 text-[12px] text-faint">Melodías que más se repiten en la canción (suelen ser el gancho)</div>
            <div className="flex flex-wrap gap-1.5">
              {an.melodias!.map((m) => (
                <Chip key={m.start_s} titulo={`Se repite ${m.repeticiones} veces`} activo={Math.abs(m.start_s - fuenteIntro) < 0.5} onClick={() => elegirTrozo(m.start_s)}>
                  {fmt(m.start_s)} · ×{m.repeticiones}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 border-t border-line pt-3">
          <div className="text-[13px] font-medium">Enlace con la canción</div>
          <p className="mb-2 text-[12px] leading-snug text-faint">Cómo pasa la intro a la canción. Si la melodía de la intro no encaja con el principio de la canción, haz que se desvanezca por debajo o ponle una cola de reverb.</p>
          <Fila apilada etiqueta="Forma de unirse">
            <Segmentado valor={it.enlace.tipo} opciones={[{ v: 'corte', t: 'Corte limpio', titulo: 'La intro acaba y entra la canción' }, { v: 'solapar', t: 'Se desvanece debajo', titulo: 'La melodía de la intro sigue sonando un poco bajo la canción' }]} onChange={(v) => cambiar((x) => void (x.intro.enlace.tipo = v))} />
          </Fila>
          {it.enlace.tipo === 'solapar' && (
            <Deslizador etiqueta="Tarda en desvanecerse" valor={it.enlace.ms} min={200} max={4000} paso={100} formato={(v) => `${(v / 1000).toFixed(1).replace('.', ',')} s`} onChange={(v) => cambiar((x) => void (x.intro.enlace.ms = v), 'enl1')} />
          )}
          <Fila etiqueta="Cola de reverb" ayuda="La última nota de la intro se alarga como un eco suave.">
            <Interruptor etiqueta="Cola de reverb" valor={it.enlace.cola} onChange={(v) => cambiar((x) => void (x.intro.enlace.cola = v))} />
          </Fila>
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <Fila etiqueta="Mezclar por capas" ayuda="Elige la batería, el bajo, la melodía y hasta un trocito de voz de partes distintas.">
            <Interruptor etiqueta="Mezclar por capas" valor={e.intro.capas.on} onChange={(v) => cambiar((x) => void (x.intro.capas.on = v))} />
          </Fila>
          {e.intro.capas.on && (
            <div className="mt-1">
              <CapaFila nombre="Batería" ayuda="El ritmo. Coge la de un estribillo para más energía." capa={e.intro.capas.bateria} fuente={fuenteIntro} onChange={(f, c) => cambiar((x) => f(x.intro.capas.bateria), c)} />
              <CapaFila nombre="Bajo" ayuda="Las notas graves." capa={e.intro.capas.bajo} fuente={fuenteIntro} onChange={(f, c) => cambiar((x) => f(x.intro.capas.bajo), c)} />
              <CapaFila nombre="Melodía" ayuda="Piano, sintes, guitarra… lo que se tararea." capa={e.intro.capas.melodia} fuente={fuenteIntro} onChange={(f, c) => cambiar((x) => f(x.intro.capas.melodia), c)} />
              <CapaFila nombre="Voz de adelanto" ayuda="Una frase cantada que adelanta el estribillo." capa={e.intro.capas.voz} fuente={fuenteIntro} onChange={(f, c) => cambiar((x) => f(x.intro.capas.voz), c)} />
              {e.intro.capas.voz.on && (
                <Fila etiqueta="Voz lejana" ayuda="Con reverb y sin agudos, como un recuerdo.">
                  <Interruptor etiqueta="Voz lejana" valor={e.intro.capas.voz.efecto} onChange={(v) => cambiar((x) => void (x.intro.capas.voz.efecto = v))} />
                </Fila>
              )}
            </div>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Entrada de la canción" descripcion="Dónde empieza a sonar la canción real después de la intro. La voz suele empezar un poco antes del compás (anacrusa): la IA lo detecta y tú puedes afinarlo. Esto es independiente de qué suena en la intro." resumen={fmt(e.song.start_s, true)}>
        <Acciones onEscuchar={() => escuchar('intro')} onRestablecer={() => restablecerSeccion('voz')} />
        <div>
          <div className="text-[13px] font-medium">Dónde entra</div>
          <p className="mb-2 text-[12px] leading-snug text-faint">También puedes arrastrar la línea «Entra la voz» en la pista de arriba. Al moverla, la intro conserva su duración.</p>
          <Ajuste
            pasos={[{ t: '−1 t', d: -T }, { t: '−10 ms', d: -0.01 }, { t: '+10 ms', d: 0.01 }, { t: '+1 t', d: T }]}
            onPaso={(d) => moverEntrada(e.song.start_s + d, 'voz')}
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[12px] text-soft">Hora exacta</span>
            <CampoTiempo etiqueta="Hora exacta de la entrada" valor={e.song.start_s} onChange={(t) => moverEntrada(t, 'voz')} />
          </div>
          {cercanas.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-faint">Entradas detectadas</span>
              {cercanas.map(([t]) => (
                <Chip key={t} activo={Math.abs(e.song.start_s - (t - 0.015)) < 0.02} onClick={() => moverEntrada(t - 0.015)}>
                  {fmt(t, true)}
                </Chip>
              ))}
            </div>
          )}
          {an.entradas_voz.length > cercanas.length && (
            <details className="mt-2 text-[12px] text-faint">
              <summary className="cursor-pointer">Todas las entradas de voz</summary>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {an.entradas_voz.filter(([, g]) => g >= 0.25).slice(0, 24).map(([t]) => (
                  <Chip key={t} activo={Math.abs(e.song.start_s - (t - 0.015)) < 0.02} onClick={() => moverEntrada(t - 0.015)}>{fmt(t, true)}</Chip>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <div className="text-[13px] font-medium">Anacrusa</div>
          <p className="mb-2 text-[12px] leading-snug text-faint">
            La voz entra {anacrusa > 0.05 ? `${anacrusa.toFixed(1).replace('.', ',')} tiempos antes` : anacrusa < -0.05 ? `${Math.abs(anacrusa).toFixed(1).replace('.', ',')} tiempos después` : 'justo en'} del golpe de la frase. Cambiarlo alarga o acorta la intro en tiempos enteros.
          </p>
          <Ajuste pasos={[{ t: '−1 t', d: -T }, { t: '+1 t', d: T }]} onPaso={(d) => cambiar((x) => void (x.intro.start_s += d), 'anacrusa')} />
        </div>
      </Seccion>

      <Seccion titulo="Cortar partes" resumen={(e.cortes_salida ?? []).length ? `${(e.cortes_salida ?? []).length} cortes` : 'Sin cortes'} descripcion="Quita cualquier trozo de tu extended ya montado (de la intro, de la canción o de la acapela) y las dos partes se unen. Hazlo al final, cuando el resto esté a tu gusto: los cortes se cuentan sobre el resultado.">
        <div className="mb-3 flex flex-wrap gap-2">
          <Btn tam="sm" variante={seleccionando === 'corte' ? 'primario' : 'suave'} onClick={() => setSeleccionando(seleccionando === 'corte' ? false : 'corte')} titulo="Arrastra sobre la pista «Tu extended» para marcar lo que quieres quitar">
            {seleccionando === 'corte' ? 'Arrastra sobre «Tu extended»…' : 'Cortar con el ratón'}
          </Btn>
          {(e.cortes_salida ?? []).length > 0 && <Btn tam="sm" variante="fantasma" onClick={() => cambiar((x) => void (x.cortes_salida = []))}>Quitar todos los cortes</Btn>}
        </div>
        {(e.cortes_salida ?? []).length === 0 ? (
          <p className="text-[12px] leading-snug text-faint">Todavía no has cortado nada. Marca un trozo con el ratón en la pista de abajo («Tu extended»); mantén Alt para marcarlo sin imán. También puedes pulsar la ✕ roja de un corte para deshacerlo.</p>
        ) : (
          <ul className="mb-3">
            {(e.cortes_salida ?? []).map((c, i) => (
              <li key={i} className="border-t border-line py-2 text-[13px] first:border-0">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-soft">Corte {i + 1} · <span className="num">{(c.fin_s - c.ini_s).toFixed(3).replace('.', ',')} s</span></span>
                  <span className="flex gap-1">
                    <Btn tam="sm" icono="play" titulo="Escuchar cómo queda el empalme" onClick={() => escucharCorte(i)}>Oír</Btn>
                    <Btn tam="sm" variante="fantasma" onClick={() => quitarCorte(i)}>Quitar corte</Btn>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CampoTiempo etiqueta="Inicio del corte" valor={c.ini_s} onChange={(t) => cambiar((x) => void (x.cortes_salida[i].ini_s = t), 'corte-i' + i)} />
                  <span className="text-faint">→</span>
                  <CampoTiempo etiqueta="Fin del corte" valor={c.fin_s} onChange={(t) => cambiar((x) => void (x.cortes_salida[i].fin_s = t), 'corte-f' + i)} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {(info?.silencios?.length ?? 0) > 0 && (
          <div className="border-t border-line pt-3">
            <div className="text-[13px] font-medium">Huecos sin sonido en tu extended</div>
            <p className="mb-2 text-[12px] leading-snug text-faint">Pausas de más de un cuarto de segundo. Pulsa una para quitarla.</p>
            <div className="flex flex-wrap gap-1.5">
              {info!.silencios!.map((h) => (
                <Chip key={h.ini_s} titulo="Quitar este hueco" onClick={() => anadirCorte(aBruto(h.ini_s, e.cortes_salida ?? []), aBruto(h.fin_s, e.cortes_salida ?? []))}>
                  {fmt(h.ini_s, true)} · {(h.fin_s - h.ini_s).toFixed(1).replace('.', ',')} s ✂
                </Chip>
              ))}
            </div>
          </div>
        )}
        {(e.cortes ?? []).length > 0 && (
          <div className="mt-3 border-t border-line pt-3 text-[12px] text-faint">
            Tienes {(e.cortes ?? []).length} corte(s) hechos sobre la canción original con una versión anterior.{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => cambiar((x) => void (x.cortes = []))}>Quitarlos</button>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Acapela final" descripcion="El final de tu extended: solo la voz de un estribillo, sin instrumental. El bloque azul de la pista de arriba es el trozo que se usa." resumen={ac.enabled ? `${ac.bars} compases` : 'Apagada'} derecha={<Interruptor etiqueta="Acapela final" valor={ac.enabled} onChange={(v) => cambiar((x) => {
        x.acapela.enabled = v
        if (v && x.acapela.start_s === null) x.acapela.start_s = ab.sugerencia.acapela.start_s ?? an.alternativas.acapela[0]?.start_s ?? null
      })} />}>
        {ac.enabled && ac.start_s !== null ? (
          <>
            <Acciones onEscuchar={() => escuchar('acapela')} onRestablecer={() => restablecerSeccion('acapela')} />
            <Fila etiqueta="Hora exacta de inicio" ayuda="Escríbela o usa ↑ ↓ para afinar al milisegundo.">
              <CampoTiempo etiqueta="Hora exacta de la acapela" valor={ac.start_s} onChange={(t) => cambiar((x) => void (x.acapela.start_s = t), 'ac-t')} />
            </Fila>
            <Fila etiqueta="Empieza en el compás" ayuda={fmt(ac.start_s, true)}>
              <Ajuste pasos={[{ t: '−8', d: -8 }, { t: '−1', d: -1 }, { t: '+1', d: 1 }, { t: '+8', d: 8 }]} onPaso={(d) => cambiar((x) => void (x.acapela.start_s = barTime(an, barK(an, x.acapela.start_s ?? 0) + d)), 'ac-pos')} texto={String(barNumber(an, kAc))} />
            </Fila>
            {an.alternativas.acapela.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-faint">Estribillos detectados</span>
                {[...an.alternativas.acapela].sort((a, b) => a.start_s - b.start_s).map((c) => (
                  <Chip key={c.start_s} titulo={`Se parece un ${Math.round(c.parecido * 100)} % a otro tramo`} activo={Math.abs(c.start_s - barTime(an, kAc)) < 1} onClick={() => cambiar((x) => void (x.acapela.start_s = barTime(an, barK(an, c.start_s))))}>
                    {fmt(c.start_s)}
                  </Chip>
                ))}
              </div>
            )}
            <Fila etiqueta="Duración" ayuda="En compases.">
              <Segmentado valor={ac.bars} opciones={[4, 8, 16, 32].map((n) => ({ v: n, t: String(n) }))} onChange={(v) => cambiar((x) => void (x.acapela.bars = v))} />
            </Fila>
            <Deslizador etiqueta="Volumen de la voz" valor={ac.gain_db} min={-12} max={12} paso={0.5} formato={(v) => `${sgn(v)} dB`} onChange={(v) => cambiar((x) => void (x.acapela.gain_db = v), 'g-ac')} />
            <Deslizador etiqueta="El instrumental se apaga en" valor={ac.inst_fade_ms} min={0} max={1000} paso={10} formato={(v) => (v === 0 ? 'Corte seco' : `${v} ms`)} onChange={(v) => cambiar((x) => void (x.acapela.inst_fade_ms = v), 'if-ac')} />
            <Deslizador etiqueta="Fundido final" valor={ac.tail_fade_ms} min={10} max={3000} paso={10} formato={(v) => `${v} ms`} onChange={(v) => cambiar((x) => void (x.acapela.tail_fade_ms = v), 'tf-ac')} />
          </>
        ) : (
          <>
            <p className="mb-2 text-[12px] text-faint">La canción suena hasta el final del archivo.</p>
            <Deslizador etiqueta="Fundido final" valor={e.end_fade_ms} min={0} max={6000} paso={100} formato={(v) => (v === 0 ? 'Sin fundido' : `${(v / 1000).toFixed(1).replace('.', ',')} s`)} onChange={(v) => cambiar((x) => void (x.end_fade_ms = v), 'ef')} />
          </>
        )}
      </Seccion>


      <Seccion titulo="Efectos de entrada" descripcion="Efectos de DJ para que la intro sea más épica y energética, como en un mix en directo. Elige un estilo y ajusta lo que quieras; cada efecto se puede activar por separado." resumen={{ ninguno: 'Sin efectos', personalizado: 'Personalizados', suave: 'Suave', intenso: 'Intenso', epico: 'Épico' }[e.fx.preset] ?? e.fx.preset}>
        <div className="mb-3 flex flex-wrap gap-2">
          <Btn tam="sm" icono="play" onClick={() => escuchar('intro')} titulo="Escucha la entrada (I)">Escuchar la entrada</Btn>
          <Btn tam="sm" variante="fantasma" icono="repetir" onClick={() => restablecerSeccion('efectos')} titulo="Vuelve al estilo que propuso la IA">Restablecer</Btn>
        </div>
        <Fila apilada etiqueta="Estilo" ayuda="Un punto de partida; luego puedes tocar cada efecto.">
          <Segmentado valor={e.fx.preset} opciones={[{ v: 'ninguno', t: 'Sin efectos' }, { v: 'suave', t: 'Suave' }, { v: 'intenso', t: 'Intenso' }, { v: 'epico', t: 'Épico', titulo: 'Para reggaetón y música de club: mucha energía' }]} onChange={(v) => fxPresets[v] && cambiar((x) => void (x.fx = JSON.parse(JSON.stringify(fxPresets[v]))))} />
        </Fila>

        <div className="mt-3 text-[12px] font-semibold text-soft">Al entrar la canción</div>
        <Efecto titulo="Filtro que se abre" ayuda="La intro suena apagada, sin agudos, y se va abriendo hasta que entra la canción." on={e.fx.intro.filtro.on} onChange={(v) => setFx((f) => void (f.intro.filtro.on = v))}>
          <Fila etiqueta="Tipo"><Segmentado valor={e.fx.intro.filtro.tipo} opciones={[{ v: 'lp', t: 'Tapado→claro', titulo: 'Empieza sin agudos' }, { v: 'hp', t: 'Fino→lleno', titulo: 'Empieza sin graves' }]} onChange={(v) => setFx((f) => void (f.intro.filtro.tipo = v))} /></Fila>
          <Deslizador etiqueta="Tarda en abrirse" valor={e.fx.intro.filtro.compases} min={1} max={8} formato={(v) => `${v} compases`} onChange={(v) => setFx((f) => void (f.intro.filtro.compases = v), 'fx1')} />
          <Deslizador etiqueta="Empieza muy apagado en" valor={e.fx.intro.filtro.desde_hz} min={150} max={3000} paso={50} formato={(v) => `${v} Hz`} onChange={(v) => setFx((f) => void (f.intro.filtro.desde_hz = v), 'fx2')} ayuda="Cuanto más bajo, más tapado suena al principio." />
        </Efecto>
        <Efecto titulo="Subida de ruido" ayuda="Un barrido de ruido que crece justo antes de que empiece la frase cantada." on={e.fx.intro.riser.on} onChange={(v) => setFx((f) => void (f.intro.riser.on = v))}>
          <Deslizador etiqueta="Dura" valor={e.fx.intro.riser.compases} min={1} max={4} formato={(v) => `${v} compases`} onChange={(v) => setFx((f) => void (f.intro.riser.compases = v), 'fx3')} />
          <Deslizador etiqueta="Volumen" valor={e.fx.intro.riser.nivel_db} min={-24} max={-4} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.intro.riser.nivel_db = v), 'fx4')} />
        </Efecto>
        <Efecto titulo="Golpe de entrada" ayuda="Un golpe grave con platillo justo cuando empieza la frase cantada." on={e.fx.intro.impacto.on} onChange={(v) => setFx((f) => void (f.intro.impacto.on = v))}>
          <Deslizador etiqueta="Volumen" valor={e.fx.intro.impacto.nivel_db} min={-24} max={-3} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.intro.impacto.nivel_db = v), 'fx5')} />
        </Efecto>
        <Efecto titulo="Silencio antes de la voz" ayuda="Un instante de silencio justo antes de entrar, para que el golpe pegue más." on={e.fx.intro.corte.on} onChange={(v) => setFx((f) => void (f.intro.corte.on = v))}>
          <Fila etiqueta="Dura"><Segmentado valor={e.fx.intro.corte.tiempos} opciones={[{ v: 1, t: '1 tiempo' }, { v: 2, t: '2 tiempos' }]} onChange={(v) => setFx((f) => void (f.intro.corte.tiempos = v))} /></Fila>
        </Efecto>
        <Efecto titulo="Redoble de caja" ayuda="Una caja que va acelerando en el último compás de la intro." on={e.fx.intro.redoble.on} onChange={(v) => setFx((f) => void (f.intro.redoble.on = v))}>
          <Fila etiqueta="Dura"><Segmentado valor={e.fx.intro.redoble.tiempos} opciones={[{ v: 2, t: '2' }, { v: 4, t: '4' }, { v: 8, t: '8 tiempos' }]} onChange={(v) => setFx((f) => void (f.intro.redoble.tiempos = v))} /></Fila>
          <Deslizador etiqueta="Volumen" valor={e.fx.intro.redoble.nivel_db} min={-24} max={-3} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.intro.redoble.nivel_db = v), 'fx6')} />
        </Efecto>
        <Efecto titulo="Más batería en la intro" ayuda="Sube la batería de la intro para darle más energía." on={e.fx.intro.bateria.on} onChange={(v) => setFx((f) => void (f.intro.bateria.on = v))}>
          <Deslizador etiqueta="Cantidad" valor={e.fx.intro.bateria.nivel_db} min={-9} max={6} paso={0.5} formato={(v) => `${v > 0 ? '+' : ''}${v} dB`} onChange={(v) => setFx((f) => void (f.intro.bateria.nivel_db = v), 'fx7')} />
        </Efecto>

        <Efecto titulo="Crescendo" ayuda="La intro va subiendo de volumen poco a poco hasta la entrada." on={e.fx.intro.crescendo.on} onChange={(v) => setFx((f) => void (f.intro.crescendo.on = v))}>
          <Deslizador etiqueta="Empieza en" valor={e.fx.intro.crescendo.desde_db} min={-30} max={-3} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.intro.crescendo.desde_db = v), 'fxc1')} />
        </Efecto>
        <Efecto titulo="Bombo extra" ayuda="Un bombo en cada tiempo para dar pegada, estilo club y reggaetón." on={e.fx.intro.bombo.on} onChange={(v) => setFx((f) => void (f.intro.bombo.on = v))}>
          <Deslizador etiqueta="Volumen" valor={e.fx.intro.bombo.nivel_db} min={-24} max={-3} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.intro.bombo.nivel_db = v), 'fxc2')} />
        </Efecto>
        <Efecto titulo="Bombeo" ayuda="El sonido «respira»: baja con cada bombo y vuelve a subir (sidechain)." on={e.fx.intro.bombeo.on} onChange={(v) => setFx((f) => void (f.intro.bombeo.on = v))}>
          <Deslizador etiqueta="Profundidad" valor={Math.round(e.fx.intro.bombeo.profundidad * 100)} min={10} max={90} formato={(v) => `${v} %`} onChange={(v) => setFx((f) => void (f.intro.bombeo.profundidad = v / 100), 'fxc3')} />
        </Efecto>
        <Efecto titulo="Platillo invertido" ayuda="Un platillo al revés que crece hasta el golpe de entrada." on={e.fx.intro.platillo_inv.on} onChange={(v) => setFx((f) => void (f.intro.platillo_inv.on = v))}>
          <Fila etiqueta="Dura"><Segmentado valor={e.fx.intro.platillo_inv.tiempos} opciones={[{ v: 4, t: '4' }, { v: 8, t: '8' }, { v: 16, t: '16 tiempos' }]} onChange={(v) => setFx((f) => void (f.intro.platillo_inv.tiempos = v))} /></Fila>
          <Deslizador etiqueta="Volumen" valor={e.fx.intro.platillo_inv.nivel_db} min={-24} max={-3} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.intro.platillo_inv.nivel_db = v), 'fxc4')} />
        </Efecto>
        <Efecto titulo="Sirena que sube" ayuda="Un tono que sube y sube antes de entrar, como en los builds de club." on={e.fx.intro.sirena.on} onChange={(v) => setFx((f) => void (f.intro.sirena.on = v))}>
          <Deslizador etiqueta="Dura" valor={e.fx.intro.sirena.compases} min={1} max={4} formato={(v) => `${v} compases`} onChange={(v) => setFx((f) => void (f.intro.sirena.compases = v), 'fxc5')} />
          <Deslizador etiqueta="Volumen" valor={e.fx.intro.sirena.nivel_db} min={-36} max={-8} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.intro.sirena.nivel_db = v), 'fxc6')} />
        </Efecto>
        <Efecto titulo="Tartamudeo" ayuda="Un trocito se repite una y otra vez justo antes de entrar (beat repeat)." on={e.fx.intro.tartamudeo.on} onChange={(v) => setFx((f) => void (f.intro.tartamudeo.on = v))}>
          <Fila etiqueta="Dura"><Segmentado valor={e.fx.intro.tartamudeo.tiempos} opciones={[{ v: 1, t: '1 tiempo' }, { v: 2, t: '2' }, { v: 4, t: '4' }]} onChange={(v) => setFx((f) => void (f.intro.tartamudeo.tiempos = v))} /></Fila>
          <Fila etiqueta="Trocito"><Segmentado valor={e.fx.intro.tartamudeo.division} opciones={[{ v: 0.5, t: '½' }, { v: 0.25, t: '¼' }, { v: 0.125, t: '⅛' }]} onChange={(v) => setFx((f) => void (f.intro.tartamudeo.division = v))} /></Fila>
        </Efecto>
        <Efecto titulo="Freno de vinilo" ayuda="La intro se frena y el tono cae justo antes de entrar." on={e.fx.intro.freno.on} onChange={(v) => setFx((f) => void (f.intro.freno.on = v))}>
          <Fila etiqueta="Dura"><Segmentado valor={e.fx.intro.freno.tiempos} opciones={[{ v: 1, t: '1 tiempo' }, { v: 2, t: '2' }, { v: 4, t: '4' }]} onChange={(v) => setFx((f) => void (f.intro.freno.tiempos = v))} /></Fila>
        </Efecto>
        <Efecto titulo="Caída de graves" ayuda="Un sub grave largo que retumba justo después del golpe." on={e.fx.intro.caida_graves.on} onChange={(v) => setFx((f) => void (f.intro.caida_graves.on = v))}>
          <Deslizador etiqueta="Volumen" valor={e.fx.intro.caida_graves.nivel_db} min={-24} max={-3} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.intro.caida_graves.nivel_db = v), 'fxc7')} />
        </Efecto>
      </Seccion>

      <Seccion titulo="Efectos de salida" descripcion="Para el final de tu extended. Necesitan la acapela final activada." resumen={[e.fx.salida.eco.on, e.fx.salida.reverb.on, e.fx.salida.filtro.on, e.fx.salida.bateria.on, e.fx.salida.corte_ritmico.on, e.fx.salida.freno.on, e.fx.salida.impacto_final.on].filter(Boolean).length + ' activos'}>
        <div className="mb-2 flex gap-2">
          <Btn tam="sm" icono="play" onClick={() => escuchar('fin')} titulo="Escucha el final (F)">Escuchar el final</Btn>
        </div>
        <Efecto titulo="Eco en la voz" ayuda="La última frase se repite y se va apagando como un eco." on={e.fx.salida.eco.on} onChange={(v) => setFx((f) => void (f.salida.eco.on = v))}>
          <Fila etiqueta="Velocidad"><Segmentado valor={e.fx.salida.eco.division} opciones={[{ v: 0.5, t: 'Rápido' }, { v: 0.75, t: 'Medio' }, { v: 1, t: 'Lento' }]} onChange={(v) => setFx((f) => void (f.salida.eco.division = v))} /></Fila>
          <Deslizador etiqueta="Volumen del eco" valor={e.fx.salida.eco.mezcla_db} min={-18} max={0} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.salida.eco.mezcla_db = v), 'fx8')} />
        </Efecto>
        <Efecto titulo="Reverb final" ayuda="La voz acaba en una cola de reverb que alarga el final." on={e.fx.salida.reverb.on} onChange={(v) => setFx((f) => void (f.salida.reverb.on = v))}>
          <Deslizador etiqueta="Duración" valor={e.fx.salida.reverb.seg} min={1} max={6} paso={0.5} formato={(v) => `${String(v).replace('.', ',')} s`} onChange={(v) => setFx((f) => void (f.salida.reverb.seg = v), 'fx9')} />
          <Deslizador etiqueta="Cantidad" valor={Math.round(e.fx.salida.reverb.mezcla * 100)} min={5} max={70} formato={(v) => `${v} %`} onChange={(v) => setFx((f) => void (f.salida.reverb.mezcla = v / 100), 'fx10')} />
        </Efecto>
        <Efecto titulo="Filtro que se cierra" ayuda="El final se va apagando, perdiendo agudos." on={e.fx.salida.filtro.on} onChange={(v) => setFx((f) => void (f.salida.filtro.on = v))}>
          <Deslizador etiqueta="Tarda en cerrarse" valor={e.fx.salida.filtro.compases} min={1} max={4} formato={(v) => `${v} compases`} onChange={(v) => setFx((f) => void (f.salida.filtro.compases = v), 'fx11')} />
          <Deslizador etiqueta="Acaba apagado en" valor={e.fx.salida.filtro.hasta_hz} min={150} max={3000} paso={50} formato={(v) => `${v} Hz`} onChange={(v) => setFx((f) => void (f.salida.filtro.hasta_hz = v), 'fx12')} />
        </Efecto>
        <Efecto titulo="Batería de fondo" ayuda="Mantiene la batería de la canción bajo la acapela para no perder energía." on={e.fx.salida.bateria.on} onChange={(v) => setFx((f) => void (f.salida.bateria.on = v))}>
          <Deslizador etiqueta="Volumen" valor={e.fx.salida.bateria.nivel_db} min={-24} max={0} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.salida.bateria.nivel_db = v), 'fx13')} />
        </Efecto>
        <Efecto titulo="Voz cortada al ritmo" ayuda="La voz se corta como una puerta rítmica en el último compás." on={e.fx.salida.corte_ritmico.on} onChange={(v) => setFx((f) => void (f.salida.corte_ritmico.on = v))}>
          <Fila etiqueta="Dura"><Segmentado valor={e.fx.salida.corte_ritmico.compases} opciones={[{ v: 1, t: '1' }, { v: 2, t: '2' }, { v: 4, t: '4 compases' }]} onChange={(v) => setFx((f) => void (f.salida.corte_ritmico.compases = v))} /></Fila>
        </Efecto>
        <Efecto titulo="Freno de vinilo" ayuda="El final se frena y el tono cae, como parar un disco." on={e.fx.salida.freno.on} onChange={(v) => setFx((f) => void (f.salida.freno.on = v))}>
          <Fila etiqueta="Dura"><Segmentado valor={e.fx.salida.freno.tiempos} opciones={[{ v: 1, t: '1 tiempo' }, { v: 2, t: '2' }, { v: 4, t: '4' }]} onChange={(v) => setFx((f) => void (f.salida.freno.tiempos = v))} /></Fila>
        </Efecto>
        <Efecto titulo="Golpe final" ayuda="Un golpe grave con platillo cuando acaba la voz." on={e.fx.salida.impacto_final.on} onChange={(v) => setFx((f) => void (f.salida.impacto_final.on = v))}>
          <Deslizador etiqueta="Volumen" valor={e.fx.salida.impacto_final.nivel_db} min={-24} max={-3} formato={(v) => `${v} dB`} onChange={(v) => setFx((f) => void (f.salida.impacto_final.nivel_db = v), 'fxs1')} />
        </Efecto>
      </Seccion>

      <Seccion titulo="Ritmo" descripcion="La rejilla de compases que se ve sobre la onda. Todo se pega a ella. Solo toca esto si las líneas no coinciden con los golpes." resumen={`${an.bpm.toString().replace('.', ',')} BPM`}>
        <Fila etiqueta="Tempo" ayuda={`Rejilla fiable al ${Math.round(an.grid.fiables * 100)} %`}>
          <span className="num text-[15px] font-medium">{an.bpm.toString().replace('.', ',')} BPM</span>
        </Fila>
        <p className="mb-2 text-[12px] leading-snug text-faint">Las líneas verticales de la canción son los compases. Si no coinciden con los golpes, muévelas; las marcas se pegan a la nueva rejilla.</p>
        <Fila etiqueta="Afinar la rejilla">
          <Ajuste pasos={[{ t: '−5 ms', d: -0.005 }, { t: '−1', d: -0.001 }, { t: '+1', d: 0.001 }, { t: '+5 ms', d: 0.005 }]} onPaso={(d) => moverRejilla(d)} />
        </Fila>
        <Fila etiqueta="Mover un tiempo">
          <Ajuste pasos={[{ t: '←', d: -T }, { t: '→', d: T }]} onPaso={(d) => moverRejilla(d)} />
        </Fila>
        <div className="flex items-center justify-between">
          <span className="num text-[12px] text-faint">Desplazamiento: {sgn((e.grid?.shift_s ?? 0) * 1000, 0)} ms</span>
          <Btn tam="sm" variante="fantasma" onClick={reiniciarRejilla} disabled={!e.grid?.shift_s}>Restablecer</Btn>
        </div>
      </Seccion>

      <Seccion titulo="Sonido" descripcion="Cómo se unen los tramos entre sí y el volumen general al exportar." resumen={`Fundido ${e.crossfade_ms} ms`}>
        <Acciones onRestablecer={() => restablecerSeccion('sonido')} />
        <Deslizador etiqueta="Fundido en las uniones" valor={e.crossfade_ms} min={0} max={100} paso={1} formato={(v) => `${v} ms`} onChange={(v) => cambiar((x) => void (x.crossfade_ms = v), 'xf')} ayuda="Más fundido suaviza el empalme; menos lo deja más seco." />
        <Fila etiqueta="Limitador suave" ayuda="Evita que la intro o la acapela saturen al exportar.">
          <Interruptor etiqueta="Limitador suave" valor={e.master.limiter} onChange={(v) => cambiar((x) => void (x.master.limiter = v))} />
        </Fila>
      </Seccion>

      <Seccion titulo="Exportación" descripcion="Cómo se guarda el archivo final." resumen={`${(ajustes?.formato ?? 'mp3').toUpperCase()}`}>
        <Fila etiqueta="Formato">
          <Segmentado valor={ajustes?.formato ?? 'mp3'} opciones={[{ v: 'mp3', t: 'MP3' }, { v: 'wav', t: 'WAV' }, { v: 'flac', t: 'FLAC' }]} onChange={(v) => void guardarAjustes({ formato: v })} />
        </Fila>
        <div className="mt-2 border-t border-line pt-3">
          <div className="text-[13px] font-medium">Portada</div>
          {ab.proyecto.portada ? (
            <div className="mt-2 flex items-start gap-3">
              <PortadaVista id={ab.id} marca={(ajustes?.portada ?? 'marca') === 'marca'} />
              <div className="min-w-0">
                <Segmentado valor={ajustes?.portada ?? 'marca'} opciones={[{ v: 'marca', t: 'Con marca' }, { v: 'igual', t: 'Igual' }, { v: 'ninguna', t: 'Sin portada' }]} onChange={(v) => void guardarAjustes({ portada: v })} />
                <p className="mt-2 text-[12px] leading-snug text-faint">
                  «Con marca» añade una franja con la palabra EXTENDED abajo para distinguirlo del original. «Igual» deja la portada tal cual. WAV no admite portada.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[12px] leading-snug text-faint">Esta canción no tiene portada incrustada, así que el extended saldrá sin ella.</p>
          )}
        </div>
      </Seccion>
    </div>
  )
}
