"""Carpeta de proyecto: pistas en FLAC + análisis + edición. Mantiene en memoria las pistas del proyecto abierto."""
import json
import os
import time

import numpy as np
import soundfile as sf

from .common import SR

PISTAS = ["original", "voz", "inst", "drums", "bass", "other"]

_cache = {"dir": None, "S": None, "an": None}


def ruta(proj, *p):
    return os.path.join(proj, *p)


def leer_json(path, defecto=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def escribir_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    os.replace(tmp, path)


def guardar_pista(proj, nombre, x):
    os.makedirs(ruta(proj, "pistas"), exist_ok=True)
    sf.write(ruta(proj, "pistas", nombre + ".flac"), x, SR, subtype="PCM_16")


def cargar(proj):
    """(pistas, análisis) del proyecto; reutiliza la memoria si ya estaba abierto."""
    proj = os.path.abspath(proj)
    if _cache["dir"] == proj and _cache["S"] is not None:
        return _cache["S"], _cache["an"]
    S = {}
    for n in PISTAS:
        p = ruta(proj, "pistas", n + ".flac")
        if not os.path.exists(p):
            raise FileNotFoundError(f"Falta la pista {n}: el proyecto está incompleto, vuelve a analizar la canción")
        x, sr = sf.read(p, always_2d=True, dtype="float32")
        S[n] = np.ascontiguousarray(x[:, :2])
    an = leer_json(ruta(proj, "analisis.json"))
    if an is None:
        raise FileNotFoundError("Falta analisis.json")
    _cache.update(dir=proj, S=S, an=an)
    return S, an


def soltar():
    _cache.update(dir=None, S=None, an=None)


def nuevo_id():
    return time.strftime("%Y%m%d-%H%M%S") + "-" + os.urandom(2).hex()
