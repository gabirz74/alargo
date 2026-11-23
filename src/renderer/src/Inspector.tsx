import { useStore } from './store'
import type { Fuente } from './types'
import { Ajuste, Btn, Chip, Deslizador, Fila, Interruptor, Segmentado, Seccion } from './ui'
import { barK, barNumber, barTime, fmt, T4 } from './util'

const sgn = (v: number, d = 1): string => (v > 0 ? '+' : '') + v.toFixed(d).replace('.', ',')

export function Inspector(): JSX.Element | null {
  const ab = useStore((s) => s.abierto)
  const info = useStore((s) => s.preview.info)
  const cambiar = useStore((s) => s.cambiar)
  const moverRejilla = useStore((s) => s.moverRejilla)
  const reiniciarRejilla = useStore((s) => s.reiniciarRejilla)
  if (!ab) return null
  const { edicion: e, analisis: an } = ab
  const T = an.grid.T
  const t4 = T4(an)
  const it = e.intro
  const ac = e.acapela

  const anacrusa = (it.start_s - e.song.start_s) / T
  const cercanas = an.entradas_voz.filter(([t, gap]) => t > it.start_s - 3.5 * t4 && t < it.start_s + t4 && gap >= 0.1).slice(0, 6)
  const kAc = ac.start_s !== null ? barK(an, ac.start_s) : 0

  return (
    <div>
      <Seccion titulo="Intro" abierta resumen={it.enabled ? `${it.bars} compases` : 'Apagada'} derecha={<Interruptor etiqueta="Intro" valor={it.enabled} onChange={(v) => cambiar((x) => void (x.intro.enabled = v))} />}>
        {it.enabled && (
          <>
            <Fila etiqueta="Sonido">
              <Segmentado<Fuente> valor={it.source} opciones={[{ v: 'inst', t: 'Completo', titulo: 'Todo el instrumental' }, { v: 'drums', t: 'Batería' }, { v: 'drums_bass', t: 'Bat. + bajo' }]} onChange={(v) => cambiar((x) => void (x.intro.source = v))} />
            </Fila>
            <Fila etiqueta="Duración" ayuda="En compases (4 tiempos cada uno).">
              <Segmentado valor={it.bars} opciones={[4, 8, 12, 16].map((n) => ({ v: n, t: String(n) }))} onChange={(v) => cambiar((x) => void (x.intro.bars = v))} />
            </Fila>
            <Fila etiqueta="Repetir en bucle" ayuda="Repite los primeros compases hasta llenar la intro.">
              <Segmentado valor={it.loop_bars} opciones={[{ v: 0, t: 'No' }, { v: 1, t: '1' }, { v: 2, t: '2' }, { v: 4, t: '4' }]} onChange={(v) => cambiar((x) => void (x.intro.loop_bars = v))} />
            </Fila>

            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1 text-[13px] font-medium">Entrada de la voz</div>
              <p className="mb-2 text-[12px] leading-snug text-faint">
                La canción retoma {anacrusa > 0.05 ? `${anacrusa.toFixed(1).replace('.', ',')} tiempos antes` : anacrusa < -0.05 ? `${Math.abs(anacrusa).toFixed(1).replace('.', ',')} tiempos después` : 'justo en'} del inicio del bloque. Arrastra «Entra la voz» en la línea de tiempo o afina aquí.
              </p>
              <Ajuste
                pasos={[{ t: '−1 t', d: -T }, { t: '−10 ms', d: -0.01 }, { t: '+10 ms', d: 0.01 }, { t: '+1 t', d: T }]}
                onPaso={(d) => cambiar((x) => void (x.song.start_s += d), 'voz')}
                texto={fmt(e.song.start_s, true)}
              />
              {cercanas.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] text-faint">Entradas detectadas</span>
                  {cercanas.map(([t]) => (
                    <Chip key={t} activo={Math.abs(e.song.start_s - (t - 0.015)) < 0.02} onClick={() => cambiar((x) => void (x.song.start_s = t - 0.015))}>
                      {fmt(t, true)}
                    </Chip>
                  ))}
                </div>
              )}
            </div>

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

      <Seccion titulo="Acapela final" abierta resumen={ac.enabled ? `${ac.bars} compases` : 'Apagada'} derecha={<Interruptor etiqueta="Acapela final" valor={ac.enabled} onChange={(v) => cambiar((x) => {
        x.acapela.enabled = v
        if (v && x.acapela.start_s === null) x.acapela.start_s = ab.sugerencia.acapela.start_s ?? an.alternativas.acapela[0]?.start_s ?? null
      })} />}>
        {ac.enabled && ac.start_s !== null ? (
          <>
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

      <Seccion titulo="Ritmo" resumen={`${an.bpm.toString().replace('.', ',')} BPM`}>
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

      <Seccion titulo="Sonido" resumen={`Fundido ${e.crossfade_ms} ms`}>
        <Deslizador etiqueta="Fundido en las uniones" valor={e.crossfade_ms} min={0} max={100} paso={1} formato={(v) => `${v} ms`} onChange={(v) => cambiar((x) => void (x.crossfade_ms = v), 'xf')} ayuda="Más fundido suaviza el empalme; menos lo deja más seco." />
        <Fila etiqueta="Limitador suave" ayuda="Evita que la intro o la acapela saturen al exportar.">
          <Interruptor etiqueta="Limitador suave" valor={e.master.limiter} onChange={(v) => cambiar((x) => void (x.master.limiter = v))} />
        </Fila>
      </Seccion>
    </div>
  )
}
