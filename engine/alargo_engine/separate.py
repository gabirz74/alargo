"""Separación de pistas con modelos locales (audio-separator): BS-Roformer (voz) y Demucs (batería, bajo, resto)."""
import os

from .common import models_dir

ROFORMER = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
DEMUCS = "htdemucs_ft.yaml"
BEAT_THIS_URL = "https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/final0.ckpt"
BEAT_THIS_FILE = "beat_this-final0.ckpt"

# nombre -> (archivos que deben existir, tamaño aproximado en MB)
MODELOS = {
    "beat_this": ([BEAT_THIS_FILE], 78),
    "demucs": (["htdemucs_ft.yaml", "f7e0c4bc-ba3fe64a.th", "d12395a8-e57c48e6.th", "92cfc3b6-ef3bcb9c.th", "04573f0d-f3cf25b2.th"], 320),
    "roformer": ([ROFORMER, ROFORMER.replace(".ckpt", ".yaml")], 610),
}


def estado_modelos():
    d = models_dir()
    out = {}
    for nombre, (archivos, mb) in MODELOS.items():
        out[nombre] = dict(listo=all(os.path.exists(os.path.join(d, a)) for a in archivos), mb=mb)
    return out


def modelos_necesarios(calidad):
    return ["beat_this", "demucs"] + (["roformer"] if calidad == "alta" else [])


_prog = None


def instalar_progreso(prog):
    """Convierte las barras tqdm de las librerías (separación, descargas) en avances del protocolo."""
    global _prog
    _prog = prog
    import tqdm.std as std

    if getattr(std.tqdm, "_alargo", False):
        return
    original_update = std.tqdm.update
    original_init = std.tqdm.__init__

    def init(self, *a, **kw):
        kw["file"] = open(os.devnull, "w")
        original_init(self, *a, **kw)

    def update(self, n=1):
        r = original_update(self, n)
        try:
            if _prog is not None and self.total and self.total > 1:
                _prog.set(self.n / self.total)
        except Exception:
            pass
        return r

    std.tqdm.__init__ = init
    std.tqdm.update = update
    std.tqdm._alargo = True


def _separador(dir_salida):
    from audio_separator.separator import Separator

    return Separator(output_dir=dir_salida, output_format="WAV", normalization_threshold=1.0,
                     model_file_dir=models_dir(), log_level=40)


def descargar_beat_this(prog=None):
    import urllib.request

    destino = os.path.join(models_dir(), BEAT_THIS_FILE)
    if os.path.exists(destino):
        return destino
    tmp = destino + ".part"
    with urllib.request.urlopen(BEAT_THIS_URL, timeout=60) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        hecho = 0
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
            hecho += len(b)
            if prog and total:
                prog.set(hecho / total)
    os.replace(tmp, destino)
    return destino


def descargar_modelo(nombre, prog):
    """Descarga un modelo (si falta). Para los de audio-separator basta cargarlo: él los baja a `models_dir()`."""
    if nombre == "beat_this":
        descargar_beat_this(prog)
        return
    instalar_progreso(prog)
    sep = _separador(os.path.join(models_dir(), "_tmp"))
    sep.load_model(ROFORMER if nombre == "roformer" else DEMUCS)


def separar(wav, dir_trabajo, calidad, prog):
    """Devuelve {nombre: ruta_wav}. 'alta': voz/instrumental con BS-Roformer + Demucs; 'rapida': solo Demucs."""
    instalar_progreso(prog)
    os.makedirs(dir_trabajo, exist_ok=True)
    res = {}

    def pasada(modelo, nombres, base, span, etiqueta):
        prog.etapa(etiqueta, base, span)
        sep = _separador(dir_trabajo)
        sep.load_model(modelo)
        sep.separate(wav, nombres)
        for v in nombres.values():
            p = os.path.join(dir_trabajo, v + ".wav")
            if not os.path.exists(p):
                raise RuntimeError(f"El modelo no generó la pista {v}")
            res[v] = p

    if calidad == "alta":
        pasada(DEMUCS, {"Drums": "drums", "Bass": "bass", "Other": "other", "Vocals": "voz_demucs"}, 0.04, 0.2, "Separando el ritmo")
        pasada(ROFORMER, {"Vocals": "voz_roformer", "Instrumental": "inst_roformer"}, 0.24, 0.56, "Separando la voz")
    else:
        pasada(DEMUCS, {"Drums": "drums", "Bass": "bass", "Other": "other", "Vocals": "voz_demucs"}, 0.04, 0.76, "Separando las pistas")
    return res
