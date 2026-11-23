"""Efectos de DJ para la entrada y la salida del extended (todo sintetizado con numpy/scipy, sin archivos extra)."""
import copy

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

from .common import SR

# ----------------------------------------------------------------------------- ajustes por defecto
FX_APAGADO = {
    "preset": "ninguno",
    "intro": {
        "filtro": {"on": False, "tipo": "lp", "desde_hz": 700, "compases": 4},   # filtro que se abre hasta la canción
        "riser": {"on": False, "compases": 2, "nivel_db": -14},                  # barrido de ruido que sube
        "impacto": {"on": False, "nivel_db": -12},                               # golpe grave + platillo al entrar
        "corte": {"on": False, "tiempos": 1},                                    # silencio justo antes de la voz
        "redoble": {"on": False, "tiempos": 4, "nivel_db": -12},                 # redoble de caja que acelera
        "bateria": {"on": False, "nivel_db": 0},                                 # refuerza la batería de la intro
    },
    "salida": {
        "eco": {"on": False, "division": 0.75, "mezcla_db": -8},                 # eco en la última frase de la voz
        "reverb": {"on": False, "seg": 2.5, "mezcla": 0.25},                     # cola de reverb tras la acapela
        "filtro": {"on": False, "hasta_hz": 500, "compases": 2},                 # filtro que se cierra
        "bateria": {"on": False, "nivel_db": -6},                                # batería de fondo bajo la acapela
        "corte_ritmico": {"on": False, "compases": 1, "division": 0.5},          # voz cortada al ritmo
    },
}

PRESETS = {
    "ninguno": copy.deepcopy(FX_APAGADO),
}


def _preset(nombre, intro, salida):
    d = copy.deepcopy(FX_APAGADO)
    d["preset"] = nombre
    for k, v in intro.items():
        d["intro"][k].update(v, on=True)
    for k, v in salida.items():
        d["salida"][k].update(v, on=True)
    return d


PRESETS["suave"] = _preset(
    "suave",
    {"filtro": {"tipo": "lp", "desde_hz": 800, "compases": 4}, "impacto": {"nivel_db": -14}},
    {"eco": {"division": 0.75, "mezcla_db": -10}, "reverb": {"seg": 2.2, "mezcla": 0.2}},
)
PRESETS["intenso"] = _preset(
    "intenso",
    {"filtro": {"tipo": "lp", "desde_hz": 400, "compases": 6}, "riser": {"compases": 2, "nivel_db": -12}, "impacto": {"nivel_db": -9},
     "redoble": {"tiempos": 4, "nivel_db": -12}, "bateria": {"nivel_db": 0}},
    {"eco": {"division": 0.75, "mezcla_db": -6}, "reverb": {"seg": 3.0, "mezcla": 0.3}, "filtro": {"hasta_hz": 600, "compases": 2},
     "bateria": {"nivel_db": -6}},
)

FX_BASE = copy.deepcopy(PRESETS["suave"])


# ----------------------------------------------------------------------------- utilidades
def _db(x):
    return float(10 ** (x / 20))


def barrido_filtro(x, f0, f1, tipo="lp", bloque=1024, mantener=0):
    """Filtro de 2.º orden cuya frecuencia de corte va (exponencialmente) de f0 a f1 a lo largo de `x`
    (se queda en f0 durante las primeras `mantener` muestras)."""
    n = len(x)
    if n < bloque * 2:
        return x
    out = np.empty_like(x)
    zi = None
    for a in range(0, n, bloque):
        e = min(n, a + bloque)
        prog = max(0.0, ((a + e) / 2 - mantener) / max(1, n - mantener))
        fc = f0 * (f1 / f0) ** prog
        fc = float(np.clip(fc, 30, 0.45 * SR))
        sos = butter(2, fc / (SR / 2), btype="low" if tipo == "lp" else "high", output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2, x.shape[1]))
        out[a:e], zi = sosfilt(sos, x[a:e], axis=0, zi=zi)
    return out


def _rng(semilla):
    return np.random.default_rng(semilla)


def ruido_riser(n, rms, semilla=7):
    """Ruido blanco estéreo con un filtro paso alto que sube y un volumen que crece hasta el final."""
    r = _rng(semilla)
    x = r.standard_normal((n, 2)).astype(np.float32)
    x = barrido_filtro(x, 500, 9000, "hp")
    env = (np.linspace(0, 1, n) ** 2.2)[:, None]
    x = x * env
    p = float(np.sqrt((x ** 2).mean())) + 1e-9
    return (x * (rms / p)).astype(np.float32)


def impacto(pico, semilla=11):
    """Golpe grave que cae de tono + chasquido de platillo (≈1,6 s)."""
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    f = 38 + 62 * np.exp(-t / 0.10)
    fase = 2 * np.pi * np.cumsum(f) / SR
    boom = np.sin(fase) * np.exp(-t / 0.32) * (1 - np.exp(-t / 0.002))
    r = _rng(semilla)
    ruido = r.standard_normal((n, 2))
    ruido = barrido_filtro(ruido.astype(np.float32), 3500, 3500, "hp")
    crash = ruido * np.exp(-t / 0.45)[:, None] * 0.28
    x = boom[:, None] * 0.9 + crash
    return (x / (np.abs(x).max() + 1e-9) * pico).astype(np.float32)


def redoble(n_total, T, tiempos, pico, semilla=3):
    """Redoble de caja sintético: corcheas -> semicorcheas -> fusas, cada vez más fuerte. Termina justo al final."""
    out = np.zeros((n_total, 2), dtype=np.float32)
    r = _rng(semilla)
    dur = tiempos * T
    golpes = []
    t = 0.0
    while t < dur - 1e-6:
        frac = t / dur
        paso = T / 2 if frac < 0.5 else T / 4 if frac < 0.8 else T / 8
        golpes.append((t, 0.25 + 0.75 * frac))
        t += paso
    for t, a in golpes:
        i = int(round(t * SR))
        m = min(int(0.09 * SR), n_total - i)
        if m <= 0:
            continue
        tt = np.arange(m) / SR
        ruido = r.standard_normal((m, 2)).astype(np.float32)
        ruido = barrido_filtro(ruido, 1500, 1500, "hp") if m > 2048 else ruido
        hit = ruido * np.exp(-tt / 0.03)[:, None] + 0.6 * np.sin(2 * np.pi * 190 * tt)[:, None] * np.exp(-tt / 0.04)[:, None]
        out[i:i + m] += (hit * a).astype(np.float32)
    mx = np.abs(out).max()
    return out / mx * pico if mx > 0 else out


def eco(x_envio, retardo_s, realim=0.5, cola_s=3.0):
    """Eco con repeticiones cada vez más oscuras. Devuelve solo las repeticiones (longitud len+cola)."""
    d = int(round(retardo_s * SR))
    n = len(x_envio) + int(cola_s * SR)
    wet = np.zeros((n, x_envio.shape[1]), dtype=np.float32)
    k, g, cut = 1, realim, 5000.0
    while g > 0.03 and k * d < n:
        sos = butter(1, min(cut, 0.45 * SR) / (SR / 2), output="sos")
        rep = sosfilt(sos, x_envio, axis=0) * g
        a = k * d
        m = min(len(rep), n - a)
        wet[a:a + m] += rep[:m].astype(np.float32)
        k += 1
        g *= realim
        cut *= 0.8
    return wet


def reverb(x, rt60, mezcla, semilla=5):
    """Reverb sintética (ruido con caída exponencial y agudos amortiguados). Devuelve x con la cola añadida."""
    n_ir = int(rt60 * SR)
    t = np.arange(n_ir) / SR
    r = _rng(semilla)
    ir = r.standard_normal((n_ir, 2)) * np.exp(-6.9 * t / rt60)[:, None]
    ir[: int(0.012 * SR)] = 0
    sos = butter(1, 5500 / (SR / 2), output="sos")
    ir = sosfilt(sos, ir, axis=0)
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True)) + 1e-9
    n = len(x) + n_ir - 1
    wet = np.stack([fftconvolve(x[:, c], ir[:, c]) for c in range(2)], 1)[:n].astype(np.float32)
    out = np.zeros((n, 2), dtype=np.float32)
    out[: len(x)] += x
    out += wet * mezcla
    return out


def puerta_ritmica(x, T, division, rampa_ms=4):
    """Corta la señal al ritmo: suena la primera mitad de cada división y calla la segunda."""
    n = len(x)
    ciclo = max(int(T * division * 2 * SR), 64)
    mitad = ciclo // 2
    env = np.zeros(n, dtype=np.float32)
    for a in range(0, n, ciclo):
        env[a:a + mitad] = 1
    r = max(2, int(rampa_ms / 1000 * SR))
    env = np.convolve(env, np.ones(r) / r, mode="same")
    return x * env[:, None]
