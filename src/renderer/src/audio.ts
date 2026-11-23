/** Reproductores fuera de React: uno para el resultado («Tu extended») y otro para la canción original. */
export type Modo = 'resultado' | 'original'

class Reproductor {
  resultado = new Audio()
  original = new Audio()
  modo: Modo = 'resultado'
  bucleTodo = false
  bucleTramo = false
  volumen = 1
  silencio = false
  private fin: number | null = null
  private ini: number | null = null
  private alFin: (() => void) | null = null

  constructor() {
    for (const a of [this.resultado, this.original]) {
      a.preload = 'auto'
      a.addEventListener('timeupdate', () => this.vigilarFin(a))
      a.addEventListener('ended', () => {
        if (this.bucleTodo && a === this.activo) {
          a.currentTime = 0
          void a.play().catch(() => {})
        } else this.alFin?.()
      })
    }
  }

  get activo(): HTMLAudioElement {
    return this.modo === 'resultado' ? this.resultado : this.original
  }
  get tiempo(): number {
    return this.activo.currentTime
  }
  get duracion(): number {
    const d = this.activo.duration
    return Number.isFinite(d) ? d : 0
  }
  get sonando(): boolean {
    return !this.activo.paused
  }
  get enTramo(): boolean {
    return this.fin !== null
  }

  private vigilarFin(a: HTMLAudioElement): void {
    if (this.fin !== null && a === this.activo && a.currentTime >= this.fin) {
      if (this.bucleTramo && this.ini !== null) {
        a.currentTime = this.ini
        return
      }
      a.pause()
      this.fin = null
      this.ini = null
      this.alFin?.()
    }
  }

  alTerminar(f: () => void): void {
    this.alFin = f
  }

  private aplicarVolumen(): void {
    for (const a of [this.resultado, this.original]) {
      a.volume = this.volumen
      a.muted = this.silencio
    }
  }
  poner(v: number): void {
    this.volumen = Math.min(1, Math.max(0, v))
    if (this.volumen > 0) this.silencio = false
    this.aplicarVolumen()
  }
  alternarSilencio(): void {
    this.silencio = !this.silencio
    this.aplicarVolumen()
  }
  alternarBucleTodo(): void {
    this.bucleTodo = !this.bucleTodo
  }
  alternarBucleTramo(): void {
    this.bucleTramo = !this.bucleTramo
  }

  /** Cambia el archivo del resultado conservando la posición y si estaba sonando. */
  cargarResultado(url: string): void {
    const a = this.resultado
    const t = a.currentTime || 0
    const estabaSonando = !a.paused && this.modo === 'resultado'
    a.src = url
    this.aplicarVolumen()
    a.addEventListener(
      'loadedmetadata',
      () => {
        if (t > 0 && t < a.duration) a.currentTime = t
        if (estabaSonando) void a.play().catch(() => {})
      },
      { once: true }
    )
  }

  cargarOriginal(url: string): void {
    if (this.original.src !== url) this.original.src = url
    this.aplicarVolumen()
  }

  usar(modo: Modo): void {
    if (modo === this.modo) return
    const antes = this.activo
    const sonaba = !antes.paused
    antes.pause()
    this.fin = null
    this.ini = null
    this.modo = modo
    if (sonaba) void this.activo.play().catch(() => {})
  }

  alternar(): void {
    const a = this.activo
    this.fin = null
    this.ini = null
    if (a.paused) void a.play().catch(() => {})
    else a.pause()
  }
  parar(): void {
    this.resultado.pause()
    this.original.pause()
    this.fin = null
    this.ini = null
  }
  ir(t: number): void {
    const a = this.activo
    const d = a.duration || t
    a.currentTime = Math.max(0, Math.min(t, d - 0.01))
  }
  saltar(delta: number): void {
    this.fin = null
    this.ini = null
    this.ir(this.tiempo + delta)
  }
  alInicio(): void {
    this.fin = null
    this.ini = null
    this.ir(0)
  }
  alFinal(): void {
    this.fin = null
    this.ini = null
    this.ir(this.duracion)
  }
  /** Reproduce un tramo del resultado y se detiene al acabar (o lo repite si «Repetir empalme» está activo). */
  tramo(desde: number, hasta: number): void {
    this.usar('resultado')
    if (this.resultado.readyState < 1) {
      this.resultado.addEventListener('loadedmetadata', () => this.tramo(desde, hasta), { once: true })
      return
    }
    this.ini = Math.max(0, desde)
    this.ir(this.ini)
    this.fin = hasta
    void this.resultado.play().catch(() => {})
  }
}

export const audio = new Reproductor()
