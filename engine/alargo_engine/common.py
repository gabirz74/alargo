"""Constantes y utilidades comunes del motor de Alargo."""
import json
import os
import subprocess
import sys
import threading

SR = 44100
BEATS_PER_BAR = 4
BARS_BLOCK = 8

_proto = None
_lock = threading.Lock()


def init_protocol():
    """Reserva el stdout real para el protocolo JSON-lines; todo `print` de librerías va a stderr."""
    global _proto
    if _proto is None:
        _proto = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr
    return _proto


def emit(obj):
    out = _proto or sys.__stdout__
    with _lock:
        out.write(json.dumps(obj, ensure_ascii=False, default=_jsonable) + "\n")
        out.flush()


def _jsonable(o):
    if hasattr(o, "item"):
        return o.item()
    if hasattr(o, "tolist"):
        return o.tolist()
    return str(o)


def ffmpeg_exe():
    env = os.environ.get("ALARGO_FFMPEG")
    if env and os.path.exists(env):
        return env
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def run_ffmpeg(args):
    cmd = [ffmpeg_exe(), "-y", "-loglevel", "error", "-nostdin"] + args
    kw = {}
    if sys.platform == "win32":
        kw["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg: " + (r.stderr or "").strip()[-400:])


def models_dir():
    d = os.environ.get("ALARGO_MODELS") or os.path.join(os.path.expanduser("~"), ".alargo", "models")
    os.makedirs(d, exist_ok=True)
    return d


class Progress:
    """Notifica avances (0..1) de una etapa. `base` y `span` colocan la etapa dentro de la barra total."""

    def __init__(self, req_id=None):
        self.req_id = req_id
        self.stage = ""
        self.base = 0.0
        self.span = 1.0
        self.last = -1.0

    def etapa(self, nombre, base, span):
        self.stage, self.base, self.span, self.last = nombre, base, span, -1.0
        self.set(0.0)

    def set(self, frac, mensaje=None):
        frac = min(1.0, max(0.0, float(frac)))
        total = self.base + self.span * frac
        if total < self.last:
            return
        if total - self.last < 0.002 and frac < 1.0 and mensaje is None:
            return
        self.last = total
        emit(dict(id=self.req_id, event="progress", stage=self.stage, fraction=round(total, 4), message=mensaje))


def asegurar_ffmpeg_en_path():
    """audio-separator busca `ffmpeg` en el PATH. Se publica el ffmpeg incluido en imageio-ffmpeg con ese nombre."""
    import shutil

    exe = ffmpeg_exe()
    nombre = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    if os.path.basename(exe).lower() == nombre:
        carpeta = os.path.dirname(exe)
    else:
        carpeta = os.path.join(os.path.dirname(os.path.abspath(models_dir())), "bin")
        os.makedirs(carpeta, exist_ok=True)
        destino = os.path.join(carpeta, nombre)
        if not os.path.exists(destino):
            if sys.platform == "win32":
                shutil.copyfile(exe, destino)
            else:
                try:
                    os.symlink(exe, destino)
                except OSError:
                    shutil.copyfile(exe, destino)
                    os.chmod(destino, 0o755)
    if carpeta not in os.environ.get("PATH", "").split(os.pathsep):
        os.environ["PATH"] = carpeta + os.pathsep + os.environ.get("PATH", "")
    return carpeta
