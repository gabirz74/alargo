import { useEffect, useState } from 'react'
import { useStore } from './store'
import { Barra, Btn, BtnIcono, Fila, Interruptor, Segmentado } from './ui'
import { fmtMB } from './util'

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="mb-9">
      <h2 className="display mb-2 text-[18px] font-semibold">{titulo}</h2>
      <div className="rounded-2xl bg-surface px-5 py-2">{children}</div>
    </section>
  )
}

export function Ajustes(): JSX.Element {
  const { ajustes, guardarAjustes, irA, motor, instalacion, descargarModelos, info, avisar } = useStore()
  const [alm, setAlm] = useState<{ motor: number; modelos: number; proyectos: number; carpeta: string; n: number } | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const mac = info?.plataforma === 'darwin'
  const cargar = (): void => void window.api.sistema.almacenamiento().then(setAlm)
  useEffect(cargar, [])
  if (!ajustes) return <div />
  const faltaAlta = ajustes.calidad === 'alta' && motor?.modelos && !motor.modelos.roformer?.listo
  return (
    <div className="flex h-full flex-col">
      <header className={`drag flex h-14 shrink-0 items-center gap-2 pr-4 ${mac ? 'pl-24' : 'pl-4'}`}>
        <BtnIcono n="atras" titulo="Volver" onClick={() => irA('biblioteca')} />
        <h1 className="display text-[20px] font-bold">Ajustes</h1>
      </header>
      <main className="flex-1 overflow-y-auto px-8 pb-12">
        <div className="mx-auto max-w-[680px] pt-3">
          <Grupo titulo="Calidad del análisis">
            <Fila etiqueta="Modelo de voz" ayuda="Alta usa BS-Roformer (la mejor separación). Rápida usa solo Demucs.">
              <Segmentado valor={ajustes.calidad} opciones={[{ v: 'alta', t: 'Alta' }, { v: 'rapida', t: 'Rápida' }]} onChange={(v) => void guardarAjustes({ calidad: v })} />
            </Fila>
            {faltaAlta && (
              <div className="flex items-center justify-between gap-4 border-t border-line py-3">
                <span className="text-[13px] text-soft">El modelo de alta calidad no está descargado (610 MB).</span>
                {instalacion?.activa ? (
                  <div className="w-40"><Barra valor={instalacion.fraction} /></div>
                ) : (
                  <Btn variante="primario" tam="sm" icono="bajar" onClick={() => void descargarModelos()}>Descargar</Btn>
                )}
              </div>
            )}
          </Grupo>

          <Grupo titulo="Apariencia">
            <Fila etiqueta="Tema">
              <Segmentado valor={ajustes.tema} opciones={[{ v: 'sistema', t: 'Sistema' }, { v: 'claro', t: 'Claro' }, { v: 'oscuro', t: 'Oscuro' }]} onChange={(v) => void guardarAjustes({ tema: v })} />
            </Fila>
          </Grupo>

          <Grupo titulo="Exportación">
            <Fila etiqueta="Formato">
              <Segmentado valor={ajustes.formato} opciones={[{ v: 'mp3', t: 'MP3' }, { v: 'wav', t: 'WAV' }, { v: 'flac', t: 'FLAC' }]} onChange={(v) => void guardarAjustes({ formato: v })} />
            </Fila>
            {ajustes.formato === 'mp3' && (
              <Fila etiqueta="Calidad MP3">
                <Segmentado valor={ajustes.kbps} opciones={[{ v: 192, t: '192' }, { v: 256, t: '256' }, { v: 320, t: '320 kbps' }]} onChange={(v) => void guardarAjustes({ kbps: v })} />
              </Fila>
            )}
            {ajustes.formato !== 'mp3' && (
              <Fila etiqueta="Profundidad">
                <Segmentado valor={ajustes.bits} opciones={[{ v: 16, t: '16 bits' }, { v: 24, t: '24 bits' }]} onChange={(v) => void guardarAjustes({ bits: v })} />
              </Fila>
            )}
            <Fila etiqueta="Nombre del archivo" ayuda="Puedes usar {titulo}, {artista} y {bpm}.">
              <input value={ajustes.patron} onChange={(e) => void guardarAjustes({ patron: e.target.value })} className="no-drag h-9 w-56 rounded-xl bg-sunken px-3 text-[13px] outline-none focus:ring-2 focus:ring-accent" />
            </Fila>
            <Fila etiqueta="Carpeta de salida" ayuda={ajustes.carpetaSalida}>
              <Btn tam="sm" onClick={() => void window.api.sistema.carpeta().then((c: string | null) => c && guardarAjustes({ carpetaSalida: c }))}>Cambiar</Btn>
            </Fila>
            <Fila etiqueta="Preguntar dónde guardar" ayuda="Si lo apagas, se guarda directamente en la carpeta de salida.">
              <Interruptor etiqueta="Preguntar dónde guardar" valor={ajustes.preguntarDonde} onChange={(v) => void guardarAjustes({ preguntarDonde: v })} />
            </Fila>
          </Grupo>

          <Grupo titulo="Espacio en disco">
            <Fila etiqueta="Motor de IA y Python" ayuda="Se instala una vez y se puede borrar cuando quieras."><span className="num text-soft">{alm ? fmtMB(alm.motor) : '…'}</span></Fila>
            <Fila etiqueta="Modelos"><span className="num text-soft">{alm ? fmtMB(alm.modelos) : '…'}</span></Fila>
            <Fila etiqueta="Canciones analizadas" ayuda={alm ? `${alm.n} en la biblioteca. Quitar una canción libera su espacio.` : undefined}><span className="num text-soft">{alm ? fmtMB(alm.proyectos) : '…'}</span></Fila>
            <div className="flex flex-wrap gap-2 border-t border-line py-3">
              <Btn tam="sm" onClick={() => void window.api.sistema.abrirDatos()}>Abrir carpeta de datos</Btn>
              {confirmar ? (
                <Btn tam="sm" variante="peligro" onClick={() => void window.api.motor.desinstalar().then(() => { setConfirmar(false); cargar(); void useStore.getState().refrescarMotor(); avisar('Motor desinstalado. Podrás volver a instalarlo cuando quieras.', 'info') })}>Confirmar: borrar motor y modelos</Btn>
              ) : (
                <Btn tam="sm" variante="fantasma" onClick={() => setConfirmar(true)}>Desinstalar motor y modelos</Btn>
              )}
            </div>
          </Grupo>

          <p className="text-[12px] text-faint">Alargo {info?.version} · Licencia MIT · Los modelos tienen sus propias licencias de código abierto.</p>
        </div>
      </main>
    </div>
  )
}
