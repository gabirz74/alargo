import { useEffect, useState } from 'react'
import { Ajustes } from './Ajustes'
import { Biblioteca } from './Biblioteca'
import { Editor } from './Editor'
import { useStore } from './store'
import { Icono } from './ui'

function Avisos(): JSX.Element {
  const { avisos, quitarAviso } = useStore()
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-graphite py-2.5 pl-4 pr-3 text-[13px] text-bg shadow-lg">
          <Icono n={a.tipo === 'ok' ? 'ok' : a.tipo === 'error' ? 'aviso' : 'nota'} size={16} />
          <span>{a.texto}</span>
          {a.accion && (
            <button type="button" onClick={() => { const ac = a.accion!; quitarAviso(a.id); if (ac.abrir) void useStore.getState().abrir(ac.abrir); else if (ac.ruta) void window.api.sistema.mostrar(ac.ruta) }} className="rounded-lg px-2 py-1 font-medium underline underline-offset-2 hover:opacity-80">
              {a.accion.texto}
            </button>
          )}
          <button type="button" aria-label="Cerrar aviso" onClick={() => quitarAviso(a.id)} className="grid h-6 w-6 place-items-center rounded-md opacity-70 hover:opacity-100">
            <Icono n="cerrar" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function App(): JSX.Element {
  const { vista, init, crear } = useStore()
  const [arrastrando, setArrastrando] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    let n = 0
    const tieneArchivos = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const entra = (e: DragEvent): void => {
      if (!tieneArchivos(e)) return
      e.preventDefault()
      n++
      setArrastrando(true)
    }
    const sale = (e: DragEvent): void => {
      if (!tieneArchivos(e)) return
      n = Math.max(0, n - 1)
      if (n === 0) setArrastrando(false)
    }
    const sobre = (e: DragEvent): void => {
      if (tieneArchivos(e)) e.preventDefault()
    }
    const suelta = (e: DragEvent): void => {
      if (!tieneArchivos(e)) return
      e.preventDefault()
      n = 0
      setArrastrando(false)
      const rutas = Array.from(e.dataTransfer!.files).map((f) => window.api.rutaDe(f)).filter(Boolean)
      useStore.getState().irA('biblioteca')
      void crear(rutas)
    }
    window.addEventListener('dragenter', entra)
    window.addEventListener('dragleave', sale)
    window.addEventListener('dragover', sobre)
    window.addEventListener('drop', suelta)
    return () => {
      window.removeEventListener('dragenter', entra)
      window.removeEventListener('dragleave', sale)
      window.removeEventListener('dragover', sobre)
      window.removeEventListener('drop', suelta)
    }
  }, [crear])

  return (
    <div className="relative h-full">
      {vista === 'biblioteca' && <Biblioteca />}
      {vista === 'editor' && <Editor />}
      {vista === 'ajustes' && <Ajustes />}
      {arrastrando && (
        <div className="pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-[28px] border-2 border-dashed border-accent bg-accent-soft/80 backdrop-blur-sm">
          <div className="display text-[28px] font-bold text-accent">Suelta para analizar</div>
        </div>
      )}
      <Avisos />
    </div>
  )
}
