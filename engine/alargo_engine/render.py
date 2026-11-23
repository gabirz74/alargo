"""Montaje del extended a partir de las pistas y de la edición (un diccionario JSON que la interfaz modifica)."""
import copy
import os

import numpy as np
import soundfile as sf

from .common import BARS_BLOCK, SR, run_ffmpeg
from . import fx as efectos
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
        "enlace": {                # cómo se une el final de la intro con la entrada de la canción
            "tipo": "corte",       # corte | solapar (la intro se desvanece por debajo de la canción)
            "ms": 1500,
            "cola": False,         # cola de reverb de la última nota de la intro
            "cola_seg": 1.8,
        },
        "fuente_s": None,          # de dónde se toma el audio de la intro (None = el mismo compás donde entra la frase)
        "capas": {                 # mezclador: cada capa puede salir de un trozo distinto de la canción
            "on": False,
            "bateria": {"on": True, "desde_s": None, "nivel_db": 0.0},
            "bajo": {"on": True, "desde_s": None, "nivel_db": 0.0},
            "melodia": {"on": True, "desde_s": None, "nivel_db": 0.0},
            "voz": {"on": False, "desde_s": None, "nivel_db": -6.0, "efecto": True},
        },
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
    "cortes": [],                  # trozos de la canción que se quitan: [{"ini_s": .., "fin_s": ..}]
    "crossfade_ms": 6.0,
    "end_fade_ms": 0.0,            # fundido final cuando no hay acapela
    "master": {"limiter": True},
    "fx": efectos.FX_BASE,
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
    if it["enlace"]["tipo"] not in ("corte", "solapar"):
        it["enlace"]["tipo"] = "corte"
    it["enlace"]["ms"] = int(min(6000, max(100, it["enlace"]["ms"])))
    cs = sorted(({"ini_s": float(c["ini_s"]), "fin_s": float(c["fin_s"])} for c in (ed.get("cortes") or []) if float(c["fin_s"]) - float(c["ini_s"]) > 0.02),
                key=lambda c: c["ini_s"])
    fus = []
    for c in cs:
        if fus and c["ini_s"] <= fus[-1]["fin_s"] + 0.01:
            fus[-1]["fin_s"] = max(fus[-1]["fin_s"], c["fin_s"])
        else:
            fus.append(c)
    ed["cortes"] = fus
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
    pico_ref = float(np.percentile(np.abs(original[::8]), 99.5)) + 1e-6
    if it["enabled"]:
        td = float(it["start_s"])                 # compás donde arranca la frase en la canción (el «golpe» de entrada)
        if R - td < -2.6 * T4 or R - td > 0.6 * T4:
            # la entrada se ha movido lejos del golpe guardado: el golpe pasa a ser el tiempo más cercano a la entrada
            td = g["t0"] + round((R - g["t0"]) / T) * T
        fs = float(it["fuente_s"]) if it.get("fuente_s") is not None else td   # de dónde se toma el audio de la intro
        N = it["bars"]
        pre, post = it["extra_pre"], it["extra_post"]
        L = N * T4 + (R - td)
        if it["auto_extra"] and not it["loop_bars"] and L / T < it["min_beats"] and F is not None:
            med = float(np.median(F[:, 1]))
            d_bar = int(round((fs - t_compas(g, j0)) / T4))
            if 1 <= d_bar <= len(F) and F[d_bar - 1, 1] >= med - 12:
                pre, post = 1, 0
            elif 0 <= d_bar + N < len(F) and F[d_bar + N, 1] >= med - 12:
                pre, post = 0, 1
        ts = fs - pre * T4
        L += (pre + post) * T4
        if L < 1.0:
            raise ValueError("La intro queda vacía: la entrada de la canción está demasiado cerca del inicio del bloque. Sube la duración de la intro o mueve la entrada.")
        if fs + (N + pre + post) * T4 > dur + 0.5:
            avisos.append("trozo_se_sale")
        enl = it["enlace"]
        cola_s = enl["ms"] / 1000 if enl["tipo"] == "solapar" else 0.0
        capas = it["capas"]
        usa_capas = bool(capas["on"])
        src = fuente(S, it["source"])

        def tomar(a, b):
            """Audio de la intro entre `a` y `b` (segundos de la canción): una pista o la mezcla de capas."""
            if not usa_capas:
                return corte(src, a, b)
            y = None
            for nombre, stem in (("bateria", S["drums"]), ("bajo", S["bass"]), ("melodia", S["other"]), ("voz", S["voz"])):
                c = capas[nombre]
                if not c["on"]:
                    continue
                off = (float(c["desde_s"]) - fs) if c.get("desde_s") is not None else 0.0
                seg = corte(stem, a + off, b + off) * efectos._db(c["nivel_db"])
                if nombre == "voz" and c.get("efecto"):
                    seg = efectos.reverb(seg, 1.8, 0.35)[: len(seg)]
                    seg = efectos.barrido_filtro(seg, 5000, 5000, "lp")
                y = seg if y is None else y + seg
            return y if y is not None else np.zeros((int(round((b - a) * SR)), 2), dtype=np.float32)

        if it["loop_bars"]:
            k = it["loop_bars"] * T4
            base = tomar(ts, ts + k + xf_s)          # el trozo + cola para empalmar
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
            intro = tomar(ts, ts + L + xf_s + cola_s)
        fxi = ed["fx"]["intro"]
        if fxi["bateria"]["on"] and not it["loop_bars"] and it["source"] != "drums" and not usa_capas:
            intro = intro + corte(S["drums"], ts, ts + L + xf_s) * efectos._db(fxi["bateria"]["nivel_db"])
        obj = sonoridad(corte(original, td, td + N * T4))
        gan = 1.0
        if it["level_match"] and obj is not None:
            gan = nivelar(intro, obj, float(it["level_cap_db"]))
        gan *= 10 ** (float(it["gain_db"]) / 20)
        intro = (intro * gan).astype(np.float32)
        if it["fade_in_ms"] > 0:
            f = min(len(intro), int(it["fade_in_ms"] / 1000 * SR))
            intro[:f] *= np.linspace(0, 1, f)[:, None]
        nL = int(round(L * SR))
        # --- efectos sobre la propia intro (de dentro hacia fuera)
        if fxi["crescendo"]["on"]:
            intro[:nL] = efectos.crescendo(intro[:nL], float(fxi["crescendo"]["desde_db"]))
        if fxi["bombeo"]["on"]:
            intro[:nL] = efectos.bombeo(intro[:nL], T, float(fxi["bombeo"]["profundidad"]))
        if fxi["bombo"]["on"]:
            intro[:nL] += efectos.bombo_extra(nL, T, pico_ref * efectos._db(fxi["bombo"]["nivel_db"]))
        fl = fxi["filtro"]
        if fl["on"]:
            n_sw = int(fl["compases"] * T4 * SR)
            f0 = float(fl["desde_hz"])
            f1 = 20000.0 if fl["tipo"] == "lp" else 30.0
            intro[:nL] = efectos.barrido_filtro(intro[:nL], f0, f1, fl["tipo"], mantener=max(0, nL - n_sw))
        if fxi["tartamudeo"]["on"]:
            m = min(nL, int(fxi["tartamudeo"]["tiempos"] * T * SR))
            intro[nL - m:nL] = efectos.tartamudeo(intro[nL - m:nL], T, float(fxi["tartamudeo"]["division"]))
        if fxi["freno"]["on"]:
            m = min(nL, int(fxi["freno"]["tiempos"] * T * SR))
            intro[nL - m:nL] = efectos.freno(intro[nL - m:nL])
        if fxi["corte"]["on"]:
            m = min(nL, int(fxi["corte"]["tiempos"] * T * SR))
            r = int(0.012 * SR)
            intro[nL - m:nL] *= 0.0
            intro[nL - m - r:nL - m] *= np.linspace(1, 0, r)[:, None]
        cola_intro = None
        if cola_s > 0 and len(intro) > nL + xf:
            cola_intro = intro[nL + xf:].copy()
            intro = intro[: nL + xf]
            fade = np.cos(np.linspace(0, np.pi / 2, len(cola_intro)))[:, None] ** 2
            cola_intro = (cola_intro * fade * 0.85).astype(np.float32)
        info["intro"] = dict(duracion_s=round(L, 3), tiempos=round(L / T, 1), extra_pre=pre, extra_post=post,
                             ganancia_db=round(20 * np.log10(max(gan, 1e-6)), 1))
        if L / T < 28 and not it["loop_bars"]:
            avisos.append("intro_corta")

    # ---- cuerpo (con los trozos que el usuario ha cortado)
    ext = xf_s if hay_acapela else 0.0
    cortes = [c for c in ed["cortes"] if c["fin_s"] > R + 0.2 and c["ini_s"] < fin_cuerpo - 0.2]
    puntos = [(R, fin_cuerpo)]
    if cortes:
        puntos = []
        a = R
        for c in cortes:
            ini, fin = max(c["ini_s"], R), min(c["fin_s"], fin_cuerpo)
            if ini - a > 0.05:
                puntos.append((a, ini))
            a = max(a, fin)
        if fin_cuerpo - a > 0.05:
            puntos.append((a, fin_cuerpo))
        if not puntos:
            raise ValueError("Has cortado toda la canción")
    cuerpo = None
    quitado = 0.0
    piezas = []        # (inicio en la canción, fin en la canción, inicio en el resultado relativo al cuerpo)
    pos = 0.0
    cortes_rel = []
    for k, (a, b) in enumerate(puntos):
        ultimo = k == len(puntos) - 1
        seg = corte(original, a, b + (ext if ultimo else xf_s))
        piezas.append((a, b, pos))
        pos += b - a
        if cuerpo is None:
            cuerpo = seg
        else:
            cortes_rel.append(pos - (b - a))
            cuerpo = unir(cuerpo, seg, xf)
    quitado = (fin_cuerpo - R) - pos

    t_hit = None
    if intro is not None:
        out = unir(intro, cuerpo, xf)
        t_cuerpo = L
        nLs = int(round(L * SR))
        if cola_intro is not None:
            a0 = nLs
            m = min(len(cola_intro), len(out) - a0)
            out[a0:a0 + m] += cola_intro[:m]
        if enl["cola"]:
            nb = int(T * SR)
            x = intro[max(0, nLs - nb):nLs]
            if len(x) > 1000:
                rv = efectos.reverb(x, float(enl["cola_seg"]), 0.9)[len(x):]
                rv = rv * 0.6
                m = min(len(rv), len(out) - nLs)
                out[nLs:nLs + m] += rv[:m]
        # ---- efectos que se superponen en el golpe de entrada (el compás donde empieza la frase cantada)
        t_hit = (N + pre + post) * T4
        i_hit = int(round(t_hit * SR))

        def sumar(a, y):
            a = max(0, a)
            m = min(len(y), len(out) - a)
            if m > 0:
                out[a:a + m] += y[:m]

        if i_hit < len(out):
            if fxi["riser"]["on"]:
                n_r = min(i_hit, int(fxi["riser"]["compases"] * T4 * SR))
                ref = out[max(0, i_hit - 4 * SR):i_hit]
                rms = float(np.sqrt((ref ** 2).mean())) if len(ref) else 0.05
                sumar(i_hit - n_r, efectos.ruido_riser(n_r, rms * efectos._db(fxi["riser"]["nivel_db"])))
            if fxi["sirena"]["on"]:
                n_s2 = min(i_hit, int(fxi["sirena"]["compases"] * T4 * SR))
                sumar(i_hit - n_s2, efectos.sirena(n_s2, pico_ref * efectos._db(fxi["sirena"]["nivel_db"])))
            if fxi["platillo_inv"]["on"]:
                n_p = min(i_hit, int(fxi["platillo_inv"]["tiempos"] * T * SR))
                sumar(i_hit - n_p, efectos.platillo_invertido(n_p, pico_ref * efectos._db(fxi["platillo_inv"]["nivel_db"])))
            if fxi["redoble"]["on"]:
                m = min(i_hit, int(fxi["redoble"]["tiempos"] * T * SR))
                sumar(i_hit - m, efectos.redoble(m, T, fxi["redoble"]["tiempos"], pico_ref * efectos._db(fxi["redoble"]["nivel_db"])))
            if fxi["impacto"]["on"]:
                sumar(i_hit, efectos.impacto(pico_ref * efectos._db(fxi["impacto"]["nivel_db"])))
            if fxi["caida_graves"]["on"]:
                sumar(i_hit, efectos.sub_grave(pico_ref * efectos._db(fxi["caida_graves"]["nivel_db"])))
            if fxi["bocina"]["on"]:
                sumar(i_hit, efectos.bocina(pico_ref * efectos._db(fxi["bocina"]["nivel_db"]), T))
        info["golpe_s"] = round(t_hit, 3)
    else:
        out = cuerpo
        t_cuerpo = 0.0
    t_ac = t_cuerpo + (fin_cuerpo - R) - quitado

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
        fxs = ed["fx"]["salida"]
        if fxs["bateria"]["on"]:
            cola = cola + corte(S["drums"], tc, tc + n_s) * efectos._db(fxs["bateria"]["nivel_db"])
        if fxs["filtro"]["on"]:
            n_f = min(len(cola), int(fxs["filtro"]["compases"] * T4 * SR))
            cola[-n_f:] = efectos.barrido_filtro(cola[-n_f:], 20000.0, float(fxs["filtro"]["hasta_hz"]), "lp")
        if fxs["corte_ritmico"]["on"]:
            n_g = min(len(cola), int(fxs["corte_ritmico"]["compases"] * T4 * SR))
            cola[-n_g:] = efectos.puerta_ritmica(cola[-n_g:], T, float(fxs["corte_ritmico"]["division"]))
        if fxs["freno"]["on"]:
            m = min(len(cola), int(fxs["freno"]["tiempos"] * T * SR))
            cola[-m:] = efectos.freno(cola[-m:])
        cola = cola.astype(np.float32)
        antes_fade = cola.copy()
        f = min(len(cola), int(max(ac["tail_fade_ms"], 5) / 1000 * SR))
        cola[-f:] *= np.linspace(1, 0, f)[:, None]
        # ---- eco y reverb: alargan el final (cola de efectos tras la última nota)
        extra = 0.0
        wet_eco = wet_rev = None
        if fxs["eco"]["on"]:
            m = min(len(cola), int(2 * T * SR))
            wet_eco = efectos.eco(antes_fade[-m:], float(fxs["eco"]["division"]) * T, 0.5, 3.0) * efectos._db(fxs["eco"]["mezcla_db"])
            wet_eco_ini = len(cola) - m
            extra = max(extra, (wet_eco_ini + len(wet_eco) - len(cola)) / SR)
        if fxs["reverb"]["on"]:
            rv = efectos.reverb(cola, float(fxs["reverb"]["seg"]), float(fxs["reverb"]["mezcla"]))
            wet_rev = rv[len(cola):]
            wet_rev_dentro = rv[:len(cola)] - cola
            extra = max(extra, len(wet_rev) / SR)
        if fxs["impacto_final"]["on"]:
            extra = max(extra, 1.6)
        if extra > 0:
            total = len(cola) + int(extra * SR)
            ext = np.zeros((total, 2), dtype=np.float32)
            ext[:len(cola)] = cola
            if wet_eco is not None:
                ext[wet_eco_ini:wet_eco_ini + len(wet_eco)] += wet_eco[: total - wet_eco_ini]
            if wet_rev is not None:
                ext[:len(cola)] += wet_rev_dentro
                ext[len(cola):len(cola) + len(wet_rev)] += wet_rev[: total - len(cola)]
            if fxs["impacto_final"]["on"]:
                h = efectos.impacto(pico_ref * efectos._db(fxs["impacto_final"]["nivel_db"]))
                a0 = max(0, len(cola) - int(0.08 * SR))
                m = min(len(h), total - a0)
                ext[a0:a0 + m] += h[:m]
            ff = min(len(ext), int(0.35 * SR))
            ext[-ff:] *= np.linspace(1, 0, ff)[:, None]
            cola = ext
            info["cola_efectos_s"] = round(extra, 2)
        out = unir(out, cola.astype(np.float32), xf)
        t_fin = t_ac + n_s
        info["acapela"] = dict(duracion_s=round(n_s, 3), compases=round(n_s / T4, 2))
    elif ed["end_fade_ms"] > 0:
        f = min(len(out), int(ed["end_fade_ms"] / 1000 * SR))
        out[-f:] *= np.linspace(1, 0, f)[:, None]

    if not hay_acapela and any(v["on"] for v in ed["fx"]["salida"].values()):
        avisos.append("fx_salida_sin_acapela")

    segmentos = []
    if intro is not None:
        segmentos.append(dict(tipo="intro", ini=0.0, fin=t_cuerpo, origen_ini=float(ts)))
    for (a_, b_, p_) in piezas:
        segmentos.append(dict(tipo="cancion", ini=t_cuerpo + p_, fin=t_cuerpo + p_ + (b_ - a_), origen_ini=a_))
    if hay_acapela:
        segmentos.append(dict(tipo="acapela", ini=t_ac, fin=t_fin, origen_ini=tc))
    info["cortes_s"] = [round(t_cuerpo + c, 3) for c in cortes_rel]
    info.update(duracion_s=round(len(out) / SR, 3), segmentos=segmentos, avisos=avisos,
                uniones=[round(x, 3) for x in ([t_cuerpo] if intro is not None else []) + ([t_ac] if hay_acapela else [])])
    info["quitado_s"] = round(quitado, 3)
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


def exportar(out, destino, formato="mp3", etiquetas=None, bits=16, kbps=320, portada=None):
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
        con = portada and os.path.exists(portada)
        entrada = ["-i", tmp] + (["-i", portada, "-map", "0:a", "-map", "1:v"] if con else [])
        if formato == "mp3":
            extra = ["-c:v", "copy", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)"] if con else []
            run_ffmpeg(entrada + extra + ["-b:a", f"{int(kbps)}k", "-id3v2_version", "3", "-map_metadata", "-1"] + meta + [str(destino)])
        elif formato == "flac":
            extra = ["-c:v", "copy", "-disposition:v", "attached_pic"] if con else []
            run_ffmpeg(entrada + extra + ["-compression_level", "8", "-map_metadata", "-1"] + meta + [str(destino)])
        else:
            raise ValueError("Formato no soportado: " + formato)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
