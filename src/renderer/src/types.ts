export type Fuente = 'inst' | 'drums' | 'drums_bass'

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
  crossfade_ms: number
  end_fade_ms: number
  master: { limiter: boolean }
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
}

export type Segmento = { tipo: 'intro' | 'cancion' | 'acapela'; ini: number; fin: number; origen_ini: number }
export type InfoRender = {
  duracion_s: number
  segmentos: Segmento[]
  uniones: number[]
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
