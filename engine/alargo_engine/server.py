"""Servidor JSON-lines: lee órdenes por stdin y responde por stdout.

  → {"id": 1, "cmd": "render", "args": {...}}
  ← {"id": 1, "event": "progress", "stage": "...", "fraction": 0.4}
  ← {"id": 1, "event": "result", "data": {...}}   |   {"id": 1, "event": "error", "message": "...", "code": "..."}
"""
import json
import os
import sys
import traceback

import numpy as np

from . import __version__, project, separate
from .common import SR, Progress, asegurar_ffmpeg_en_path, emit, init_protocol, models_dir


def cmd_ping(a, prog):
    return dict(version=__version__, python=sys.version.split()[0], models=models_dir())


def cmd_models_status(a, prog):
    est = separate.estado_modelos()
    necesarios = separate.modelos_necesarios(a.get("calidad", "alta"))
    faltan = [n for n in necesarios if not est[n]["listo"]]
    return dict(modelos=est, necesarios=necesarios, faltan=faltan, mb_pendientes=sum(est[n]["mb"] for n in faltan))


def cmd_models_download(a, prog):
    nombres = a.get("nombres") or separate.modelos_necesarios(a.get("calidad", "alta"))
    est = separate.estado_modelos()
    pend = [n for n in nombres if not est[n]["listo"]]
    total = sum(est[n]["mb"] for n in pend) or 1
    hecho = 0
    for n in pend:
        peso = est[n]["mb"] / total
        prog.etapa({"beat_this": "Descargando el detector de ritmo", "demucs": "Descargando el modelo de ritmo y bajo",
                    "roformer": "Descargando el modelo de voz"}[n], hecho, peso)
        separate.descargar_modelo(n, prog)
        hecho += peso
    prog.etapa("Listo", 1.0, 0.0)
    return cmd_models_status(a, prog)


def cmd_analyze(a, prog):
    from . import analysis

    return analysis.analizar(a["proyecto"], a["entrada"], a.get("calidad", "alta"), prog, a.get("pistas_listas"))


def cmd_open(a, prog):
    proj = a["proyecto"]
    S, an = project.cargar(proj)
    return dict(analisis=an, edicion=project.leer_json(project.ruta(proj, "edicion.json")),
                sugerencia=project.leer_json(project.ruta(proj, "sugerencia.json")),
                picos=project.leer_json(project.ruta(proj, "picos.json")),
                proyecto=project.leer_json(project.ruta(proj, "proyecto.json")))


def _montar(a):
    from .render import masterizar, render

    S, an = project.cargar(a["proyecto"])
    ed = a.get("edicion") or project.leer_json(project.ruta(a["proyecto"], "edicion.json"))
    out, info = render(S, an, ed)
    pico = float(np.abs(S["original"]).max())
    out = masterizar(out, pico, bool((ed.get("master") or {}).get("limiter", True)))
    return out, info, an, pico


def cmd_render(a, prog):
    """Prepara la previsualización: un WAV de 16 bits en `salida` y los picos del resultado."""
    from .dsp import picos
    from .render import guardar_wav

    out, info, an, pico = _montar(a)
    destino = a["salida"]
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    guardar_wav(destino, out, 16)
    info["picos"] = picos(out, 100, max(pico, 1e-6))
    info["archivo"] = destino
    return info


def cmd_export(a, prog):
    from .render import exportar

    prog.etapa("Creando el archivo", 0.0, 1.0)
    out, info, an, pico = _montar(a)
    prog.set(0.5)
    et = dict(a.get("etiquetas") or {})
    et["TBPM" if a.get("formato", "mp3") == "mp3" else "BPM"] = str(int(round(an["bpm"])))
    exportar(out, a["destino"], a.get("formato", "mp3"), et, int(a.get("bits", 16)), int(a.get("kbps", 320)))
    prog.set(1.0)
    info["archivo"] = a["destino"]
    return info


def cmd_close(a, prog):
    project.soltar()
    return {}


COMANDOS = dict(ping=cmd_ping, models_status=cmd_models_status, models_download=cmd_models_download, analyze=cmd_analyze,
                open=cmd_open, render=cmd_render, export=cmd_export, close=cmd_close)


def atender(msg):
    rid = msg.get("id")
    prog = Progress(rid)
    try:
        f = COMANDOS.get(msg.get("cmd"))
        if f is None:
            raise ValueError("Orden desconocida: %s" % msg.get("cmd"))
        emit(dict(id=rid, event="result", data=f(msg.get("args") or {}, prog)))
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        code = type(e).__name__
        emit(dict(id=rid, event="error", message=str(e) or code, code=code))


def servir():
    init_protocol()
    try:
        asegurar_ffmpeg_en_path()
    except Exception as e:  # noqa: BLE001
        print('ffmpeg no disponible:', e, file=sys.stderr)
    emit(dict(event="ready", version=__version__))
    for linea in sys.stdin:
        linea = linea.strip()
        if not linea:
            continue
        try:
            msg = json.loads(linea)
        except ValueError:
            continue
        if msg.get("cmd") == "quit":
            break
        atender(msg)
