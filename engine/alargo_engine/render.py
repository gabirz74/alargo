"""Montaje del extended a partir de las pistas y de la edición (un diccionario JSON que la interfaz modifica)."""
import copy
import os

import numpy as np
import soundfile as sf

from .common import BARS_BLOCK, SR, run_ffmpeg
from .dsp import nivelar, picos, sonoridad, t_compas

EDICION_BASE = {
    "version": 1,
    "intro": {
        "enabled": True,
        "source": "inst",          # inst | drums | drums_bass
        "start_s": 0.0,            # inicio (en la canción) del bloque que se usa de intro; cae en un compás
        "bars": 8,                 # compases de intro
        "loop_bars": 0,            # 0 = sin bucle; 1/2/4 = repite ese número de compases hasta llenar la intro
        "auto_extra": True,        # añade un compás si la intro queda corta (ritmo puro < min_beats)
        "extra_pre": 0,
        "extra_post": 0,
        "min_beats": 28,
        "level_match": True,       # iguala la sonoridad de la intro con la de la canción
        "level_cap_db": 5.0,
        "gain_db": 0.0,
        "fade_in_ms": 0.0,
    },
    "song": {
        "start_s": 0.0,            # dónde retoma la canción original (inicio de la frase con su anacrusa)
        "end_s": None,             # solo si no hay acapela: dónde termina la canción (None = final del archivo)
    },
    "acapela": {
        "enabled": True,
        "start_s": None,           # inicio (en la canción) del bloque que se deja solo con voz; cae en un compás
        "bars": 8,
        "gain_db": 0.0,
        "inst_fade_ms": 120.0,     # el instrumental se apaga en este tiempo al entrar la acapela
        "tail_fade_ms": 80.0,      # fundido del final
    },
    "crossfade_ms": 6.0,
    "end_fade_ms": 0.0,            # fundido final cuando no hay acapela
    "master": {"limiter": True},
}


def _mezclar_dict(base, extra):
    out = copy.deepcopy(base)
    for k, v in (extra or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _mezclar_dict(out[k], v)
        else:
            out[k] = v
    return out


def normalizar_edicion(ed):
    ed = _mezclar_dict(EDICION_BASE, ed)
    it, ac = ed["intro"], ed["acapela"]
    it["bars"] = int(min(32, max(1, it["bars"])))
    it["loop_bars"] = int(it["loop_bars"] or 0)
    if it["loop_bars"] not in (0, 1, 2, 4, 8):
        it["loop_bars"] = 0
    if it["source"] not in ("inst", "drums", "drums_bass"):
        it["source"] = "inst"
    it["extra_pre"] = int(min(4, max(0, it["extra_pre"])))
    it["extra_post"] = int(min(4, max(0, it["extra_post"])))
    ac["bars"] = int(min(64, max(1, ac["bars"])))
    if ac["start_s"] is None:
        ac["enabled"] = False
    ed["crossfade_ms"] = float(min(200.0, max(0.0, ed["crossfade_ms"])))
    return ed


# ----------------------------------------------------------------------------- utilidades
def corte(x, a, b):
    a, b = int(round(a * SR)), int(round(b * SR))
    pad_i = max(0, -a)
    seg = x[max(a, 0): max(b, 0)]
    return np.pad(seg, ((pad_i, max(0, (b - a) - len(seg) - pad_i)), (0, 0)))


def mezcla(a, b):
    x = np.linspace(0, 1, len(a))[:, None]
    return a * (1 - x) + b * x


def unir(a, b, xf):
    xf = min(xf, len(a), len(b))
    if xf <= 0:
        return np.concatenate([a, b])
    return np.concatenate([a[:-xf], mezcla(a[-xf:], b[:xf]), b[xf:]])


def fuente(S, nombre):
    if nombre == "drums":
        return S["drums"]
    if nombre == "drums_bass":
        return S["drums"] + S["bass"]
    return S["inst"]


# ----------------------------------------------------------------------------- render
def render(S, an, ed):
    """Devuelve (audio float32 sin limitar, info). `S`: pistas alineadas; `an`: análisis; `ed`: edición."""
    ed = normalizar_edicion(ed)
    g = an["grid"]
    T, T4 = g["T"], 4 * g["T"]
    j0 = an["j0"]
    F = np.asarray(an["F"]) if an.get("F") is not None else None
    original = S["original"]
    dur = len(original) / SR
    xf = max(2, int(ed["crossfade_ms"] / 1000 * SR))
    xf_s = xf / SR
    it, ac, so = ed["intro"], ed["acapela"], ed["song"]
    R = float(so["start_s"])
    avisos = []
    info = {}

    # ---- fin del cuerpo y acapela
    hay_acapela = bool(ac["enabled"] and ac["start_s"] is not None)
    if hay_acapela:
        tc = float(ac["start_s"])
        fin_cuerpo = tc
    else:
        fin_cuerpo = float(so["end_s"]) if so["end_s"] else dur
        fin_cuerpo = min(fin_cuerpo, dur)
    if fin_cuerpo <= R + 1.0:
        raise ValueError("La canción termina antes de empezar: revisa dónde retoma y dónde acaba")

    # ---- intro
    intro = None
    L = 0.0
    if it["enabled"]:
        td = float(it["start_s"])
        N = it["bars"]
        pre, post = it["extra_pre"], it["extra_post"]
        L = N * T4 + (R - td)
        if it["auto_extra"] and not it["loop_bars"] and L / T < it["min_beats"] and F is not None:
            med = float(np.median(F[:, 1]))
            d_bar = int(round((td - t_compas(g, j0)) / T4))
            if 1 <= d_bar <= len(F) and F[d_bar - 1, 1] >= med - 12:
                pre, post = 1, 0
            elif 0 <= d_bar + N < len(F) and F[d_bar + N, 1] >= med - 12:
                pre, post = 0, 1
        ts = td - pre * T4
        L += (pre + post) * T4
        src = fuente(S, it["source"])
        if it["loop_bars"]:
            k = it["loop_bars"] * T4
            base = corte(src, ts, ts + k + xf_s)          # el trozo + cola para empalmar
            n_rep = int(np.ceil(L / k))
            paso = int(round(k * SR))
            buf = np.zeros((n_rep * paso + xf + 8, 2), dtype=np.float32)
            fin_ = np.linspace(0, 1, xf)[:, None]
            for i in range(n_rep):
                seg = base.copy()
                if i > 0:
                    seg[:xf] *= fin_                 # entra suave...
                if i < n_rep - 1:
                    seg[-xf:] *= 1 - fin_            # ...mientras la repetición anterior se apaga sobre ella
                a = i * paso
                n = min(len(seg), len(buf) - a)
                buf[a:a + n] += seg[:n]
            intro = buf[: int(round(L * SR)) + xf]
        else:
            intro = corte(src, ts, ts + L + xf_s)
        obj = sonoridad(corte(original, td, td + N * T4))
        gan = 1.0
        if it["level_match"] and obj is not None:
            gan = nivelar(intro, obj, float(it["level_cap_db"]))
        gan *= 10 ** (float(it["gain_db"]) / 20)
        intro = (intro * gan).astype(np.float32)
        if it["fade_in_ms"] > 0:
            f = min(len(intro), int(it["fade_in_ms"] / 1000 * SR))
            intro[:f] *= np.linspace(0, 1, f)[:, None]
        info["intro"] = dict(duracion_s=round(L, 3), tiempos=round(L / T, 1), extra_pre=pre, extra_post=post,
                             ganancia_db=round(20 * np.log10(max(gan, 1e-6)), 1))
        if L / T < 28 and not it["loop_bars"]:
            avisos.append("intro_corta")

    # ---- cuerpo
    cuerpo = corte(original, R, fin_cuerpo + (xf_s if hay_acapela else 0))

    partes_t = {}  # marcas en el tiempo de salida
    if intro is not None:
        out = unir(intro, cuerpo, xf)
        t_cuerpo = L
    else:
        out = cuerpo
        t_cuerpo = 0.0
    t_ac = t_cuerpo + (fin_cuerpo - R)

    # ---- acapela
    t_fin = t_ac if not hay_acapela else None
    if hay_acapela:
        voz = S["voz"]
        n_s = min(ac["bars"] * T4, max(0.0, dur - tc)) if tc < dur else 0.0
        if n_s < 0.2:
            raise ValueError("No queda canción para la acapela en ese punto")
        if n_s < ac["bars"] * T4 - 1e-3:
            avisos.append("acapela_recortada")
        cola = corte(voz, tc, tc + n_s) * float(10 ** (ac["gain_db"] / 20))
        fi = int(min(ac["inst_fade_ms"], 2000) / 1000 * SR)
        if fi > 8:
            resto = corte(S["inst"], tc, tc + fi / SR)
            resto = resto * (np.cos(np.linspace(0, np.pi / 2, len(resto)))[:, None] ** 2)
            cola[: len(resto)] += resto
        f = min(len(cola), int(max(ac["tail_fade_ms"], 5) / 1000 * SR))
        cola[-f:] *= np.linspace(1, 0, f)[:, None]
        out = unir(out, cola.astype(np.float32), xf)
        t_fin = t_ac + n_s
        info["acapela"] = dict(duracion_s=round(n_s, 3), compases=round(n_s / T4, 2))
    elif ed["end_fade_ms"] > 0:
        f = min(len(out), int(ed["end_fade_ms"] / 1000 * SR))
        out[-f:] *= np.linspace(1, 0, f)[:, None]

    segmentos = []
    if intro is not None:
        segmentos.append(dict(tipo="intro", ini=0.0, fin=t_cuerpo, origen_ini=float(it["start_s"])))
    segmentos.append(dict(tipo="cancion", ini=t_cuerpo, fin=t_ac, origen_ini=R))
    if hay_acapela:
        segmentos.append(dict(tipo="acapela", ini=t_ac, fin=t_fin, origen_ini=tc))
    info.update(duracion_s=round(len(out) / SR, 3), segmentos=segmentos, avisos=avisos,
                uniones=[round(x, 3) for x in ([t_cuerpo] if intro is not None else []) + ([t_ac] if hay_acapela else [])])
    return out.astype(np.float32), info


# ----------------------------------------------------------------------------- masterizado y exportación
def masterizar(out, pico_original, limitador=True):
    """Un solo ajuste de volumen para todo el archivo (el mínimo que evite saturar la canción original) y un limitador
    suave para los picos que pudieran sobrar en la intro o la acapela."""
    esc = min(1.0, 0.98 / max(pico_original, 1e-9))
    out = out * esc
    if limitador:
        techo, ancho = 0.92, 0.06
        exceso = np.abs(out) > techo
        out[exceso] = np.sign(out[exceso]) * (techo + ancho * np.tanh((np.abs(out[exceso]) - techo) / ancho))
    return np.clip(out, -0.995, 0.995).astype(np.float32)


def guardar_wav(ruta, out, bits=16):
    sf.write(str(ruta), out, SR, subtype="PCM_24" if bits == 24 else "PCM_16")


def exportar(out, destino, formato="mp3", etiquetas=None, bits=16, kbps=320):
    """Escribe `destino` (con su extensión) en mp3 / wav / flac."""
    etiquetas = etiquetas or {}
    formato = formato.lower()
    if formato == "wav":
        guardar_wav(destino, out, bits)
        return
    tmp = str(destino) + ".tmp.wav"
    guardar_wav(tmp, out, 24 if (formato == "flac" and bits == 24) else 16)
    meta = []
    for k, v in etiquetas.items():
        if v:
            meta += ["-metadata", f"{k}={v}"]
    try:
        if formato == "mp3":
            run_ffmpeg(["-i", tmp, "-b:a", f"{int(kbps)}k", "-id3v2_version", "3", "-map_metadata", "-1"] + meta + [str(destino)])
        elif formato == "flac":
            run_ffmpeg(["-i", tmp, "-compression_level", "8", "-map_metadata", "-1"] + meta + [str(destino)])
        else:
            raise ValueError("Formato no soportado: " + formato)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
