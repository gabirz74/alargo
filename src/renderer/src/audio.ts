/** Reproductores fuera de React: uno para el resultado y otro para la canción original. */
export type Modo = 'resultado' | 'original'

class Reproductor {
  resultado = new Audio()
  original = new Audio()
  modo: Modo = 'resultado'
  private fin: number | null = null
  private alFin: (() => void) | null = null

  constructor() {
    for (const a of [this.resultado, this.original]) {
      a.preload = 'auto'
      a.addEventListener('timeupdate', () => this.vigilarFin(a))
      a.addEventListener('ended', () => this.alFin?.())
    }
  }

  get activo(): HTMLAudioElement {
    return this.modo === 'resultado' ? this.resultado : this.original
  }
  get tiempo(): number {
    return this.activo.currentTime
  }
  get sonando(): boolean {
    return !this.activo.paused
  }

  private vigilarFin(a: HTMLAudioElement): void {
    if (this.fin !== null && a === this.activo && a.currentTime >= this.fin) {
      a.pause()
      this.fin = null
      this.alFin?.()
    }
  }

  alTerminar(f: () => void): void {
    this.alFin = f
  }

  /** Cambia el archivo del resultado conservando la posición y si estaba sonando. */
  cargarResultado(url: string): void {
    const a = this.resultado
    const t = a.currentTime || 0
    const estabaSonando = !a.paused && this.modo === 'resultado'
    a.src = url
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
  }

  usar(modo: Modo): void {
    if (modo === this.modo) return
    const antes = this.activo
    const sonaba = !antes.paused
    antes.pause()
    this.modo = modo
    if (sonaba) void this.activo.play().catch(() => {})
  }

  alternar(): void {
    const a = this.activo
    this.fin = null
    if (a.paused) void a.play().catch(() => {})
    else a.pause()
  }
  parar(): void {
    this.resultado.pause()
    this.original.pause()
    this.fin = null
  }
  ir(t: number): void {
    const a = this.activo
    a.currentTime = Math.max(0, Math.min(t, (a.duration || t) - 0.01))
  }
  /** Reproduce un tramo y se detiene al acabar (para «escuchar uniones»). */
  tramo(desde: number, hasta: number): void {
    this.usar('resultado')
    this.ir(Math.max(0, desde))
    this.fin = hasta
    void this.resultado.play().catch(() => {})
  }
}

export const audio = new Reproductor()
