"""Análisis de una canción: separación, rejilla de tiempos, estructura y sugerencia de extended."""
import os
import re
import shutil
import time

import numpy as np

from . import dsp, portada, project, separate
from .common import SR, models_dir, run_ffmpeg
from .render import EDICION_BASE, normalizar_edicion


def etiquetas(path):
    """(título, artista) a partir de las etiquetas del archivo o, si no hay, del nombre «Artista - Título»."""
    titulo = artista = None
    try:
        import mutagen

        m = mutagen.File(path, easy=True)
        if m:
            titulo = (m.get("title") or [None])[0]
            artista = (m.get("artist") or [None])[0]
    except Exception:
        pass
    nombre = os.path.splitext(os.path.basename(path))[0]
    if not titulo:
        if " - " in nombre:
            a, t = nombre.split(" - ", 1)
            artista = artista or a.strip()
            titulo = t.strip()
        else:
            titulo = nombre
    return titulo, artista or ""


def _beats(ruta_audio):
    import torch  # noqa: F401
    from beat_this.inference import File2Beats

    ck = os.path.join(models_dir(), separate.BEAT_THIS_FILE)
    if not os.path.exists(ck):
        separate.descargar_beat_this()
    return File2Beats(checkpoint_path=ck, device="cpu", dbn=False)(ruta_audio)


def alinear_pistas(original, grupo):
    """Alinea (lag) y reajusta niveles de un grupo de pistas que juntas suman la mezcla."""
    lag = dsp.lag_entre(original, _suma(grupo, original))
    for k in grupo:
        grupo[k] = dsp.aplicar_lag(grupo[k], lag)
    g = dsp.corregir_niveles(original, list(grupo.values()))
    for (k, v), gan in zip(list(grupo.items()), g):
        grupo[k] = v * gan
    return lag, g


def _suma(grupo, original):
    n = min([len(original)] + [len(v) for v in grupo.values()])
    s = np.zeros((n, 2), dtype=np.float32)
    for v in grupo.values():
        s += v[:n]
    return s


def analizar(proj, entrada, calidad, prog, pistas_listas=None):
    """Crea todo el proyecto en `proj`. `pistas_listas`: dict de rutas ya separadas (solo para pruebas)."""
    t_ini = time.time()
    os.makedirs(proj, exist_ok=True)
    trabajo = project.ruta(proj, "_trabajo")
    os.makedirs(trabajo, exist_ok=True)
    titulo, artista = etiquetas(entrada)

    prog.etapa("Preparando el audio", 0.0, 0.04)
    wav = project.ruta(trabajo, "original.wav")
    run_ffmpeg(["-i", entrada, "-vn", "-ar", str(SR), "-ac", "2", "-c:a", "pcm_f32le", wav])
    prog.set(1.0)

    if pistas_listas is None:
        pistas_listas = separate.separar(wav, trabajo, calidad, prog)

    prog.etapa("Ajustando las pistas", 0.84, 0.04)
    original = dsp.cargar(wav)
    demucs = {k: dsp.cargar(pistas_listas[k]) for k in ("drums", "bass", "other", "voz_demucs")}
    lag_d, g_d = alinear_pistas(original, demucs)
    if calidad == "alta" and "voz_roformer" in pistas_listas:
        rof = {"voz": dsp.cargar(pistas_listas["voz_roformer"]), "inst": dsp.cargar(pistas_listas["inst_roformer"])}
        lag_r, g_r = alinear_pistas(original, rof)
        voz, inst = rof["voz"], rof["inst"]
    else:
        lag_r, g_r = lag_d, g_d
        voz = demucs["voz_demucs"]
        inst = demucs["drums"] + demucs["bass"] + demucs["other"]
    drums, bass, other = demucs["drums"], demucs["bass"], demucs["other"]
    largo = min(len(x) for x in (original, voz, inst, drums, bass, other))
    S = {k: v[:largo] for k, v in dict(original=original, voz=voz, inst=inst, drums=drums, bass=bass, other=other).items()}
    dur = largo / SR
    prog.set(1.0)

    prog.etapa("Buscando el ritmo y la estructura", 0.88, 0.12)
    beats, downbeats = _beats(project.ruta(trabajo, "original.wav"))
    grid = dsp.ajustar_rejilla(beats, downbeats)
    grid = dsp.refinar_fase(grid, S["inst"], dur)
    grid = dsp.refinar_con_bateria(grid, S["drums"], dur)
    prog.set(0.35)
    j0, n_bar, F = dsp.caracteristicas(S["voz"], S["inst"], grid, dur)
    if n_bar < 20:
        raise ValueError("La canción es demasiado corta para crear un extended (menos de 20 compases)")
    activo = dsp.limpiar_actividad(F[:, 0] > np.percentile(F[:, 0], 90) - 14, 6)
    nov = dsp.novedad(F, [0, 1, 2, 3])
    cai = dsp.caidas(F)
    fase0 = int(np.argmax([nov[o::8].sum() for o in range(8)]))
    fase_ini = dsp.fase_local(cai, 0, min(n_bar, 48), fase0)
    fase_fin = dsp.fase_local(cai, max(0, n_bar - 40), n_bar, fase0)
    prog.set(0.6)

    entradas = dsp.entradas_voz(S["voz"])
    cands = dsp.candidatos_entrada(F, grid, j0, n_bar, fase_ini, entradas)
    Sm = dsp.similitud(dsp.rasgos_voz(S["voz"], grid["T"], grid["t0"], j0, n_bar), n_bar)
    tabla = dsp.tabla_estribillos(Sm, activo, fase_fin, n_bar)
    c_bar, info_fin = dsp.elegir_estribillo(tabla, n_bar)
    prog.set(0.85)

    melodias = dsp.candidatos_melodia(S["other"] + S["bass"], grid, j0, n_bar, F, fase_ini)
    d_bar, R, info_in = cands[0]
    sug = dict(
        intro=dict(start_s=dsp.t_compas(grid, j0 + d_bar)),
        song=dict(start_s=R),
        acapela=dict(enabled=c_bar is not None, start_s=None if c_bar is None else dsp.t_compas(grid, j0 + c_bar)),
    )
    sug = normalizar_edicion(sug)
    if c_bar is None:
        sug["acapela"]["enabled"] = False

    otras_intro = [dict(start_s=round(dsp.t_compas(grid, j0 + b), 4), resume_s=round(r, 4), info=i) for b, r, i in cands]
    ordenadas = sorted(tabla.items(), key=lambda kv: (kv[1]["parecido"] >= 0.6 and kv[1]["densidad_voz"] >= 0.6, kv[0]), reverse=True)
    otras_acap = [dict(start_s=round(dsp.t_compas(grid, j0 + c), 4), **d) for c, d in ordenadas[:8]]

    an = dict(
        version=1, titulo=titulo, artista=artista, duracion_s=round(dur, 3), bpm=round(60 / grid["T"], 2),
        grid=dict(T=grid["T"], t0=grid["t0"], fiables=round(grid["fiables"], 3), desv_ms=round(grid["desv_ms"], 1),
                  ajuste_bateria_ms=grid.get("ajuste_bateria_ms")),
        j0=j0, n_bar=n_bar, F=np.round(F, 2).tolist(), activo=[bool(a) for a in activo],
        fase=dict(global_=fase0, inicio=fase_ini, final=fase_fin),
        entradas_voz=[[round(t, 3), round(min(g, 9.0), 2)] for t, g in entradas],
        alternativas=dict(intro=otras_intro, acapela=otras_acap), melodias=melodias, silencios=dsp.detectar_silencios(S["original"]),
        info_sugerencia=dict(intro=info_in, estribillo=info_fin),
        calidad=calidad, ajuste=dict(lag_muestras=int(lag_r), ganancias=g_r),
    )
    prog.set(0.95, "Guardando")
    # --- pistas y gráficos
    for n, x in S.items():
        project.guardar_pista(proj, n, x)
    tiene_portada = portada.extraer(entrada, project.ruta(proj, "pistas", "portada.jpg"))
    escala = float(max(np.abs(S["original"]).max(), 1e-6))
    picos = dict(original=dsp.picos(S["original"], 100, escala), voz=dsp.picos(S["voz"], 100, escala), inst=dsp.picos(S["inst"], 100, escala))
    project.escribir_json(project.ruta(proj, "picos.json"), picos)
    project.escribir_json(project.ruta(proj, "analisis.json"), an)
    project.escribir_json(project.ruta(proj, "edicion.json"), sug)
    project.escribir_json(project.ruta(proj, "sugerencia.json"), sug)
    meta = dict(id=os.path.basename(os.path.abspath(proj)), titulo=titulo, artista=artista, archivo=entrada,
                creado=time.strftime("%Y-%m-%dT%H:%M:%S"), calidad=calidad, duracion_s=an["duracion_s"], bpm=an["bpm"],
                estado="listo", portada=bool(tiene_portada), segundos_analisis=round(time.time() - t_ini))
    project.escribir_json(project.ruta(proj, "proyecto.json"), meta)
    shutil.rmtree(trabajo, ignore_errors=True)
    prog.set(1.0)
    return dict(proyecto=meta, analisis=an, edicion=sug, picos=picos)
