"""Pruebas del motor sin modelos: montaje con pistas sintéticas y protocolo JSON-lines."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from alargo_engine import dsp, render  # noqa: E402
from alargo_engine.common import SR  # noqa: E402

BPM = 120.0
T = 60 / BPM
T4 = 4 * T


def sintetico(duracion=120.0):
    n = int(duracion * SR)
    t = np.arange(n) / SR
    drums = np.zeros(n, dtype=np.float32)
    for k in range(int(duracion / T)):
        i = int(k * T * SR)
        m = min(n - i, int(0.08 * SR))
        drums[i:i + m] += (np.exp(-np.arange(m) / (0.02 * SR)) * np.sin(2 * np.pi * 60 * np.arange(m) / SR)).astype(np.float32)
    bass = (0.2 * np.sin(2 * np.pi * 55 * t)).astype(np.float32)
    voz = (0.3 * np.sin(2 * np.pi * 440 * t) * (np.sin(2 * np.pi * t / T4 / 2) > 0)).astype(np.float32)
    st = lambda x: np.stack([x, x], 1)
    S = dict(drums=st(drums), bass=st(bass), other=st(0 * drums), voz=st(voz))
    S["inst"] = S["drums"] + S["bass"]
    S["original"] = S["inst"] + S["voz"]
    nb = int(duracion // T4)
    F = np.zeros((nb, 6))
    F[:, 1] = -20
    F[:, 2] = -10
    F[:, 4] = 1
    an = dict(grid=dict(T=T, t0=0.0), j0=0, n_bar=nb, F=F.tolist(), duracion_s=duracion, bpm=BPM)
    return S, an


def edicion(**cambios):
    base = dict(intro=dict(start_s=8 * T4, bars=8), song=dict(start_s=8 * T4 - 1.0), acapela=dict(enabled=True, start_s=20 * T4))
    return render.normalizar_edicion(render._mezclar_dict(base, cambios))


class Montaje(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.S, cls.an = sintetico()

    def test_estructura_y_duracion(self):
        out, info = render.render(self.S, self.an, edicion())
        seg = {s["tipo"]: s for s in info["segmentos"]}
        self.assertEqual(set(seg), {"intro", "cancion", "acapela"})
        # intro = 8 compases menos la anacrusa de 1 s (+1 compás si el ritmo puro queda corto)
        self.assertAlmostEqual(seg["intro"]["fin"], 8 * T4 - 1.0, delta=T4 + 0.1)
        self.assertAlmostEqual(len(out) / SR, info["duracion_s"], places=2)
        self.assertTrue(np.isfinite(out).all())

    def test_ritmo_continuo_en_la_union(self):
        # con la batería sola, el golpe siguiente a la unión intro->canción debe caer en la rejilla de tiempos
        ed = edicion(intro=dict(source="drums", level_match=False, auto_extra=False))
        S = dict(self.S, original=self.S["drums"], voz=0 * self.S["voz"])  # sin voz ni bajo: solo importa el pulso
        out, info = render.render(S, self.an, ed)
        u = info["uniones"][0]
        env = np.abs(out.mean(1))
        # golpes: máximos locales cada T segundos; medir desfase respecto a la unión
        ventana = env[int((u - 3) * SR):int((u + 3) * SR)]
        picos = [i for i in range(1, len(ventana) - 1) if ventana[i] > 0.5 * ventana.max() and ventana[i] >= ventana[i - 1] and ventana[i] > ventana[i + 1]]
        t = np.array(picos) / SR + (u - 3)
        fase = (t - u) % T
        fase = np.where(fase > T / 2, fase - T, fase)
        antes, despues = fase[t < u - 0.05], fase[t > u + 0.05]
        self.assertGreater(len(antes), 3)
        self.assertGreater(len(despues), 3)
        self.assertLess(abs(np.median(antes) - np.median(despues)), 0.002)  # el ritmo no se desplaza más de 2 ms

    def test_variantes(self):
        for cambio in (dict(intro=dict(loop_bars=2)), dict(intro=dict(source="drums_bass", bars=16)),
                       dict(acapela=dict(enabled=False)), dict(intro=dict(enabled=False)), dict(acapela=dict(bars=16)),
                       dict(crossfade_ms=0), dict(end_fade_ms=2000, acapela=dict(enabled=False))):
            out, info = render.render(self.S, self.an, edicion(**cambio))
            self.assertGreater(len(out), SR * 10, cambio)
            self.assertTrue(np.isfinite(out).all(), cambio)

    def test_errores_claros(self):
        with self.assertRaises(ValueError):
            render.render(self.S, self.an, edicion(song=dict(start_s=119.5), acapela=dict(enabled=False), intro=dict(enabled=False)))

    def test_masterizado_no_satura(self):
        out, _ = render.render(self.S, self.an, edicion())
        m = render.masterizar(out * 3, 1.0)
        self.assertLessEqual(float(np.abs(m).max()), 0.995)

    def test_exportar_formatos(self):
        out, _ = render.render(self.S, self.an, edicion())
        with tempfile.TemporaryDirectory() as d:
            for fmt in ("wav", "flac", "mp3"):
                p = os.path.join(d, "x." + fmt)
                render.exportar(out[: SR * 5], p, fmt, {"title": "T", "artist": "A"})
                self.assertGreater(os.path.getsize(p), 1000)
            x, sr = sf.read(os.path.join(d, "x.flac"))
            self.assertEqual(sr, SR)

    def test_picos(self):
        p = dsp.picos(self.S["original"], 100)
        self.assertEqual(p["n"], len(self.S["original"]) // (SR // 100))


class Protocolo(unittest.TestCase):
    def test_ping_y_modelos(self):
        env = dict(os.environ, PYTHONPATH=os.path.join(os.path.dirname(__file__), ".."), ALARGO_MODELS=tempfile.mkdtemp())
        p = subprocess.Popen([sys.executable, "-m", "alargo_engine"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env,
                             cwd=os.path.join(os.path.dirname(__file__), ".."))
        try:
            self.assertEqual(json.loads(p.stdout.readline())["event"], "ready")
            p.stdin.write(json.dumps(dict(id=1, cmd="ping")) + "\n")
            p.stdin.write(json.dumps(dict(id=2, cmd="models_status", args=dict(calidad="alta"))) + "\n")
            p.stdin.flush()
            r1 = json.loads(p.stdout.readline())
            r2 = json.loads(p.stdout.readline())
            self.assertEqual(r1["event"], "result")
            self.assertEqual(r2["data"]["faltan"], ["beat_this", "demucs", "roformer"])
        finally:
            p.stdin.write(json.dumps(dict(cmd="quit")) + "\n")
            p.stdin.flush()
            p.wait(timeout=10)


if __name__ == "__main__":
    unittest.main()
