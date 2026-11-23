export type Fuente = 'inst' | 'drums' | 'drums_bass'

export type Capa = { on: boolean; desde_s: number | null; nivel_db: number }

export type Efectos = {
  preset: string
  intro: {
    filtro: { on: boolean; tipo: 'lp' | 'hp'; desde_hz: number; compases: number }
    riser: { on: boolean; compases: number; nivel_db: number }
    impacto: { on: boolean; nivel_db: number }
    corte: { on: boolean; tiempos: number }
    redoble: { on: boolean; tiempos: number; nivel_db: number }
    bateria: { on: boolean; nivel_db: number }
    platillo_inv: { on: boolean; tiempos: number; nivel_db: number }
    sirena: { on: boolean; compases: number; nivel_db: number }
    caida_graves: { on: boolean; nivel_db: number }
    freno: { on: boolean; tiempos: number }
    tartamudeo: { on: boolean; tiempos: number; division: number }
    bombeo: { on: boolean; profundidad: number }
    bombo: { on: boolean; nivel_db: number }
    crescendo: { on: boolean; desde_db: number }
  }
  salida: {
    eco: { on: boolean; division: number; mezcla_db: number }
    reverb: { on: boolean; seg: number; mezcla: number }
    filtro: { on: boolean; hasta_hz: number; compases: number }
    bateria: { on: boolean; nivel_db: number }
    corte_ritmico: { on: boolean; compases: number; division: number }
    freno: { on: boolean; tiempos: number }
    impacto_final: { on: boolean; nivel_db: number }
  }
}

export type Edicion = {
  version: number
  intro: {
    enabled: boolean
    source: Fuente
    start_s: number
    bars: number
    loop_bars: number
    auto_extra: boolean
    extra_pre: number
    extra_post: number
    min_beats: number
    level_match: boolean
    level_cap_db: number
    gain_db: number
    fade_in_ms: number
    fuente_s: number | null
    enlace: { tipo: 'corte' | 'solapar'; ms: number; cola: boolean; cola_seg: number }
    capas: {
      on: boolean
      bateria: Capa
      bajo: Capa
      melodia: Capa
      voz: Capa & { efecto: boolean }
    }
  }
  song: { start_s: number; end_s: number | null }
  acapela: {
    enabled: boolean
    start_s: number | null
    bars: number
    gain_db: number
    inst_fade_ms: number
    tail_fade_ms: number
  }
  grid?: { shift_s: number }
  cortes: { ini_s: number; fin_s: number }[]
  cortes_salida: { ini_s: number; fin_s: number }[]
  crossfade_ms: number
  end_fade_ms: number
  master: { limiter: boolean }
  fx: Efectos
}

export type PicosCrudos = { pps: number; n: number; escala: number; datos: string }
export type Picos = { pps: number; n: number; escala: number; datos: Int8Array }

export type Analisis = {
  titulo: string
  artista: string
  duracion_s: number
  bpm: number
  grid: { T: number; t0: number; fiables: number; desv_ms: number }
  j0: number
  n_bar: number
  F: number[][]
  activo: boolean[]
  entradas_voz: [number, number][]
  silencios?: { ini_s: number; fin_s: number }[]
  melodias?: { compas: number; start_s: number; repeticiones: number; energia_db: number }[]
  alternativas: {
    intro: { start_s: number; resume_s: number; info: Record<string, unknown> }[]
    acapela: { start_s: number; parecido: number; densidad_voz: number }[]
  }
  calidad: string
}

export type Proyecto = {
  id: string
  titulo: string
  artista: string
  archivo: string
  creado: string
  calidad: 'alta' | 'rapida'
  duracion_s?: number
  bpm?: number
  estado: 'en_cola' | 'analizando' | 'listo' | 'error'
  error?: string
  progreso?: number
  etapa?: string
  inicio?: number
  portada?: boolean
}

export type Segmento = { tipo: 'intro' | 'cancion' | 'acapela'; ini: number; fin: number; origen_ini: number }
export type InfoRender = {
  duracion_s: number
  segmentos: Segmento[]
  uniones: number[]
  cortes_s?: number[]
  silencios?: { ini_s: number; fin_s: number }[]
  quitado_s?: number
  avisos: string[]
  intro?: { duracion_s: number; tiempos: number; extra_pre: number; extra_post: number; ganancia_db: number }
  acapela?: { duracion_s: number; compases: number }
  picos: PicosCrudos
  url: string
}

export type Ajustes = {
  calidad: 'alta' | 'rapida'
  tema: 'sistema' | 'claro' | 'oscuro'
  carpetaSalida: string
  formato: 'mp3' | 'wav' | 'flac'
  kbps: number
  bits: 16 | 24
  patron: string
  preguntarDonde: boolean
  portada: 'marca' | 'igual' | 'ninguna'
}

export type EstadoMotor = {
  motorListo: boolean
  modelos: Record<string, { listo: boolean; mb: number }> | null
  faltan: string[]
  mbPendientes: number
  instalando: boolean
  error?: string
}

declare global {
  interface Window {
    api: any
  }
}
