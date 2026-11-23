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
        from alargo_engine import fx
        ed = edicion(intro=dict(source="drums", level_match=False, auto_extra=False), fx=fx.PRESETS["ninguno"])
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


class Portada(unittest.TestCase):
    def test_extraer_marca_y_exportar(self):
        from PIL import Image

        from alargo_engine import portada
        from alargo_engine.common import ffmpeg_exe, run_ffmpeg

        with tempfile.TemporaryDirectory() as d:
            jpg = os.path.join(d, "c.jpg")
            Image.new("RGB", (600, 600), (200, 40, 40)).save(jpg)
            wav = os.path.join(d, "a.wav")
            sf.write(wav, np.zeros((SR, 2), dtype="float32"), SR)
            mp3 = os.path.join(d, "a.mp3")
            run_ffmpeg(["-i", wav, "-i", jpg, "-map", "0:a", "-map", "1:v", "-c:v", "copy", "-id3v2_version", "3", mp3])
            ext = os.path.join(d, "ext.jpg")
            self.assertTrue(portada.extraer(mp3, ext))
            self.assertFalse(portada.extraer(wav, os.path.join(d, "no.jpg")))   # sin portada
            marca = os.path.join(d, "marca.jpg")
            portada.con_marca(ext, marca)
            self.assertNotEqual(open(ext, "rb").read(), open(marca, "rb").read())
            im = Image.open(marca)
            self.assertLess(sum(im.getpixel((300, 590))), 150)                   # la franja inferior es oscura
            for fmt in ("mp3", "flac"):
                dest = os.path.join(d, "o." + fmt)
                render.exportar(np.zeros((SR, 2), dtype="float32"), dest, fmt, {"title": "t"}, portada=marca)
                r = subprocess.run([ffmpeg_exe(), "-i", dest], capture_output=True, text=True)
                self.assertIn("Video", r.stderr, fmt)


class Efectos(unittest.TestCase):
    def test_presets_y_cola(self):
        from alargo_engine import fx

        S, an = sintetico()
        sin = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"]))[0]
        con, info = render.render(S, an, edicion(fx=fx.PRESETS["intenso"]))
        self.assertGreater(len(con), len(sin))             # eco y reverb alargan el final
        self.assertTrue(np.isfinite(con).all())
        self.assertGreater(info["cola_efectos_s"], 1.0)
        # el filtro de intro oscurece los agudos al principio
        a = np.abs(np.fft.rfft(sin[SR:2 * SR, 0]))
        b = np.abs(np.fft.rfft(con[SR:2 * SR, 0]))
        hf = slice(int(4000 * 1.0), int(12000 * 1.0))
        self.assertLessEqual(b[hf].sum(), a[hf].sum() + 1e-6)

    def test_sin_acapela_avisa(self):
        S, an = sintetico()
        _, info = render.render(S, an, edicion(acapela=dict(enabled=False)))
        self.assertIn("fx_salida_sin_acapela", info["avisos"])


class Capas(unittest.TestCase):
    def test_trozo_de_otra_parte_y_capas(self):
        from alargo_engine import fx

        S, an = sintetico()
        base, _ = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"]))
        # misma duración, pero el audio de la intro cambia si se toma de otro compás
        otro, info = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"], intro=dict(fuente_s=24.0 + 8 * T4 - 8 * T4 + 2 * T4)))
        self.assertEqual(len(base), len(otro))
        capas, _ = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"], intro=dict(capas=dict(on=True, bajo=dict(on=False), melodia=dict(on=False)))))
        self.assertEqual(len(base), len(capas))
        self.assertFalse(np.allclose(base[: SR * 4], capas[: SR * 4]))   # solo batería: no suena el bajo

    def test_efectos_nuevos(self):
        from alargo_engine import fx

        S, an = sintetico()
        todo = {**fx.PRESETS["ninguno"], "intro": {k: {**v, "on": True} for k, v in fx.PRESETS["ninguno"]["intro"].items()},
                "salida": {k: {**v, "on": True} for k, v in fx.PRESETS["ninguno"]["salida"].items()}}
        out, info = render.render(S, an, edicion(fx=todo))
        self.assertTrue(np.isfinite(out).all())
        self.assertIn("epico", fx.PRESETS)

    def test_melodias(self):
        from alargo_engine import dsp

        S, an = sintetico(120.0)
        res = dsp.candidatos_melodia(S["bass"] + S["other"], an["grid"], 0, an["n_bar"], np.asarray(an["F"]), 0)
        self.assertGreater(len(res), 0)
        self.assertIn("start_s", res[0])


class Independencia(unittest.TestCase):
    def test_entrada_lejos_del_bloque_no_acorta_la_intro(self):
        from alargo_engine import fx

        S, an = sintetico()
        ed = edicion(fx=fx.PRESETS["ninguno"], intro=dict(fuente_s=40.0), song=dict(start_s=6.0))   # entrada lejos de start_s
        _, info = render.render(S, an, ed)
        self.assertGreater(info["intro"]["duracion_s"], 8 * T4 - 1.0)

    def test_cortes(self):
        from alargo_engine import fx

        S, an = sintetico()
        base, i0 = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"]))
        cort, i1 = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"], cortes=[{"ini_s": 30.0, "fin_s": 36.0}]))
        self.assertAlmostEqual((len(base) - len(cort)) / SR, 6.0, delta=0.02)
        self.assertEqual(len(i1["cortes_s"]), 1)
        self.assertGreater(len([s for s in i1["segmentos"] if s["tipo"] == "cancion"]), 1)

    def test_enlace_solapar_y_cola(self):
        from alargo_engine import fx

        S, an = sintetico()
        a, _ = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"]))
        b, _ = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"], intro=dict(enlace=dict(tipo="solapar", ms=2000, cola=True))))
        self.assertEqual(len(a), len(b))
        self.assertFalse(np.allclose(a, b))
        self.assertTrue(np.isfinite(b).all())


class CortesResultado(unittest.TestCase):
    def test_cortes_de_salida(self):
        from alargo_engine import fx

        S, an = sintetico()
        base, i0 = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"]))
        cort, i1 = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"], cortes_salida=[{"ini_s": 2.0, "fin_s": 4.0}, {"ini_s": 30.0, "fin_s": 33.0}]))
        self.assertAlmostEqual((len(base) - len(cort)) / SR, 5.0, delta=0.03)
        self.assertEqual(len(i1["cortes_s"]), 2)
        self.assertAlmostEqual(i1["duracion_s"], i0["duracion_s"] - 5.0, delta=0.03)
        self.assertTrue(np.isfinite(cort).all())

    def test_picos_bandas_y_ventana(self):
        from alargo_engine import dsp

        S, an = sintetico()
        b = dsp.picos_bandas(S["original"][: SR * 5], 200, 1.0)
        self.assertEqual(set(b), {"bajos", "medios", "altos"})
        self.assertEqual(b["bajos"]["ini"], 1.0)


class Transicion(unittest.TestCase):
    def test_efectos_antes_de_la_acapela(self):
        from alargo_engine import fx

        S, an = sintetico()
        base, i0 = render.render(S, an, edicion(fx=fx.PRESETS["ninguno"]))
        tr = {**fx.PRESETS["ninguno"], "transicion": {k: {**v, "on": True} for k, v in fx.PRESETS["ninguno"]["transicion"].items()}}
        out, info = render.render(S, an, edicion(fx=tr))
        t_ac = [s for s in info["segmentos"] if s["tipo"] == "acapela"][0]["ini"]
        self.assertEqual(len(out) >= len(base), True)
        self.assertTrue(np.isfinite(out).all())
        i = int(t_ac * SR)
        antes = slice(i - SR, i)      # el último segundo antes de la acapela cambia...
        self.assertFalse(np.allclose(out[antes], base[antes]))
        lejos = slice(int((t_ac - 15) * SR), int((t_ac - 10) * SR))   # ...pero lo anterior no
        self.assertTrue(np.allclose(out[lejos], base[lejos]))

    def test_presets_con_transicion(self):
        from alargo_engine import fx

        for n in ("suave", "intenso", "epico"):
            self.assertTrue(any(v["on"] for v in fx.PRESETS[n]["transicion"].values()), n)
        self.assertFalse(any(v["on"] for v in fx.PRESETS["ninguno"]["transicion"].values()))
