import { contextBridge, ipcRenderer, webUtils } from 'electron'

const inv = (canal: string, ...a: unknown[]): Promise<any> => ipcRenderer.invoke(canal, ...a)
const suscribir = (canal: string, f: (d: any) => void): (() => void) => {
  const h = (_: unknown, d: unknown): void => f(d)
  ipcRenderer.on(canal, h)
  return () => ipcRenderer.removeListener(canal, h)
}

const api = {
  info: () => inv('app:info'),
  ajustes: { leer: () => inv('ajustes:leer'), guardar: (a: unknown) => inv('ajustes:guardar', a) },
  motor: {
    estado: (c: string) => inv('motor:estado', c),
    instalar: (c: string) => inv('motor:instalar', c),
    modelos: (c: string) => inv('motor:modelos', c),
    desinstalar: () => inv('motor:desinstalar'),
    alProgreso: (f: (d: any) => void) => suscribir('motor:progreso', f)
  },
  proyectos: {
    listar: () => inv('proy:listar'),
    crear: (rutas: string[]) => inv('proy:crear', rutas),
    elegir: () => inv('proy:elegir'),
    borrar: (id: string) => inv('proy:borrar', id),
    cancelar: (id: string) => inv('proy:cancelar', id),
    reintentar: (id: string) => inv('proy:reintentar', id),
    renombrar: (id: string, t: string, a: string) => inv('proy:renombrar', id, t, a),
    abrir: (id: string) => inv('proy:abrir', id),
    picosVentana: (id: string, ini: number, fin: number, pps: number, escala: number) => inv('proy:picos-ventana', id, ini, fin, pps, escala),
    cerrar: () => inv('proy:cerrar'),
    guardarEdicion: (id: string, ed: unknown) => inv('proy:guardar-edicion', id, ed),
    render: (id: string, ed: unknown) => inv('proy:render', id, ed),
    exportar: (id: string, ed: unknown, op: unknown) => inv('proy:exportar', id, ed, op),
    alEvento: (f: (d: any) => void) => suscribir('proy:evento', f),
    alExportar: (f: (d: any) => void) => suscribir('export:progreso', f)
  },
  sistema: {
    mostrar: (r: string) => inv('sis:mostrar', r),
    carpeta: () => inv('sis:carpeta'),
    almacenamiento: () => inv('sis:almacenamiento'),
    abrirDatos: () => inv('sis:abrir-datos')
  },
  rutaDe: (f: File): string => webUtils.getPathForFile(f)
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
