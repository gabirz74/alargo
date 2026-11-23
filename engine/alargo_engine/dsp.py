"""Análisis de señal: carga, alineado, rejilla de tiempos, rasgos por compás, entradas de voz, estribillo."""
import base64

import librosa
import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.ndimage import binary_closing, binary_opening, median_filter

from .common import BARS_BLOCK, BEATS_PER_BAR, SR

W = BARS_BLOCK


# ----------------------------------------------------------------------------- audio
def cargar(path):
    y, sr = sf.read(str(path), always_2d=True, dtype="float32")
    if sr != SR:
        y = librosa.resample(y.T, orig_sr=sr, target_sr=SR).T
    if y.shape[1] == 1:
        y = np.repeat(y, 2, axis=1)
    return np.ascontiguousarray(y[:, :2])


def lag_entre(original, mezcla):
    """Desfase (muestras) entre la mezcla original y la suma de pistas: los modelos pueden mover el audio unos ms."""
    n = min(len(original), len(mezcla), SR * 60)
    a = original[:n].mean(1)
    b = mezcla[:n].mean(1)
    corr = np.fft.irfft(np.fft.rfft(a, 2 * n) * np.conj(np.fft.rfft(b, 2 * n)))
    return int(np.argmax(np.concatenate([corr[-2000:], corr[:2000]]))) - 2000


def aplicar_lag(x, lag):
    if lag > 0:
        return np.pad(x, ((lag, 0), (0, 0)))
    if lag < 0:
        return x[-lag:]
    return x


def corregir_niveles(original, pistas):
    """Mínimos cuadrados: devuelve la ganancia de cada pista para que su suma se parezca a la mezcla."""
    n = min([len(original)] + [len(p) for p in pistas])
    A = np.stack([p[:n].ravel()[::7] for p in pistas], 1)
    g, *_ = np.linalg.lstsq(A, original[:n].ravel()[::7], rcond=None)
    return [float(v) for v in g]


# ----------------------------------------------------------------------------- rejilla de tiempos
def ajustar_rejilla(beats, downbeats):
    """Rejilla de tempo constante: busca el tempo para el que los tiempos detectados 'caen en fase' (ignora tramos donde
    el detector se pierde: medio tiempo, finales sin pulso...)."""
    beats = np.asarray(beats, float)
    d = np.diff(beats)
    T0 = np.median(d[(d > 0.8 * np.median(d)) & (d < 1.2 * np.median(d))])
    cand = T0 * np.linspace(0.97, 1.03, 6001)
    coh = np.array([np.abs(np.exp(2j * np.pi * beats / T).mean()) for T in cand])
    T = cand[np.argmax(coh)]
    ang = np.angle(np.exp(2j * np.pi * beats / T).mean()) / (2 * np.pi)
    t0 = ang * T
    for tol in (0.04, 0.03, 0.025, 0.02, 0.02):
        k = np.round((beats - t0) / T)
        ok = np.abs(beats - (t0 + k * T)) < tol
        if ok.sum() < 8:
            break
        T, t0 = np.polyfit(k[ok], beats[ok], 1)
    k = np.round((beats - t0) / T)
    res = beats - (t0 + k * T)
    ok = np.abs(res) < 0.02
    kd = np.round((np.asarray(downbeats) - t0) / T)
    rd = np.asarray(downbeats) - (t0 + kd * T)
    votos = np.bincount((kd[np.abs(rd) < 0.025] % BEATS_PER_BAR).astype(int), minlength=BEATS_PER_BAR)
    fase = int(np.argmax(votos))
    return dict(T=float(T), t0=float(t0 + fase * T), fiables=float(ok.mean()), desv_ms=float(res[ok].std() * 1000),
                votos=votos.tolist(), coherencia=float(coh.max()))


def refinar_fase(grid, base, dur):
    env = librosa.onset.onset_strength(y=base.mean(1), sr=SR, hop_length=128)
    tt = librosa.frames_to_time(np.arange(len(env)), sr=SR, hop_length=128)
    T, t0 = grid["T"], grid["t0"]
    beats = t0 + T * np.arange(int(-t0 / T) + 1, int((dur - t0) / T))
    mejor = (-1, 0.0)
    for off in np.arange(-0.08, 0.0805, 0.001):
        s = np.interp(beats + off, tt, env).mean()
        if s > mejor[0]:
            mejor = (s, off)
    grid["t0"] += mejor[1]
    grid["ajuste_fase_ms"] = round(mejor[1] * 1000, 1)
    return grid


def refinar_con_bateria(grid, bateria, dur):
    """Con la batería aislada se localiza el ataque real de cada golpe y se mueve la rejilla para que cada corte
    caiga 3 ms ANTES del golpe: el bombo nunca queda partido por la mitad."""
    hop = 32
    env = librosa.onset.onset_strength(y=bateria.mean(1), sr=SR, hop_length=hop, aggregate=np.max)
    tt = librosa.frames_to_time(np.arange(len(env)), sr=SR, hop_length=hop)
    T, t0 = grid["T"], grid["t0"]
    umbral = 0.35 * np.percentile(env, 99.5)
    offs = []
    for k in range(int(-t0 / T) + 1, int((dur - t0) / T)):
        b = t0 + k * T
        m = (tt > b - 0.06) & (tt < b + 0.06)
        if m.sum() and env[m].max() >= umbral:
            offs.append(tt[m][np.argmax(env[m])] - b)
    if len(offs) < 16:
        return grid
    med = float(np.median(offs))
    grid["t0"] = t0 + med - 0.003
    grid["ajuste_bateria_ms"] = round((med - 0.003) * 1000, 1)
    grid["golpes_bateria"] = len(offs)
    return grid


def t_compas(grid, j):
    return grid["t0"] + j * BEATS_PER_BAR * grid["T"]


# ----------------------------------------------------------------------------- rasgos por compás
def db(x):
    return 20 * np.log10(np.maximum(x, 1e-6))


def caracteristicas(voz, inst, grid, dur):
    T = grid["T"]
    j0 = int(np.ceil(-grid["t0"] / (4 * T)))
    n_bar = int((dur - t_compas(grid, j0)) // (4 * T))
    hop = 512
    rv = librosa.feature.rms(y=voz.mean(1), frame_length=2048, hop_length=hop)[0]
    ri = librosa.feature.rms(y=inst.mean(1), frame_length=2048, hop_length=hop)[0]
    S = np.abs(librosa.stft(inst.mean(1), n_fft=2048, hop_length=hop))
    f = librosa.fft_frequencies(sr=SR, n_fft=2048)
    low = np.sqrt((S[f < 150] ** 2).mean(0))
    hi = np.sqrt((S[f > 4000] ** 2).mean(0))
    on = librosa.onset.onset_strength(y=inst.mean(1), sr=SR, hop_length=hop)
    tt = librosa.frames_to_time(np.arange(len(rv)), sr=SR, hop_length=hop)
    F = np.zeros((max(n_bar, 0), 6))
    for i in range(n_bar):
        a, b = t_compas(grid, j0 + i), t_compas(grid, j0 + i + 1)
        m = (tt >= a) & (tt < b)
        if not m.any():
            continue
        F[i] = [db(rv[m].mean()), db(ri[m].mean()), db(low[m].mean() / 30), db(hi[m].mean() / 30),
                on[m[: len(on)]].mean() if len(on) >= m.sum() else 0, db(rv[m].max())]
    return j0, n_bar, F


def novedad(F, cols, w=4):
    Z = (F[:, cols] - F[:, cols].mean(0)) / (F[:, cols].std(0) + 1e-6)
    nov = np.zeros(len(F))
    for i in range(len(F)):
        a, b = Z[max(0, i - w): i], Z[i: i + w]
        if len(a) and len(b):
            nov[i] = np.linalg.norm(b.mean(0) - a.mean(0))
    return nov


def caidas(F):
    """Compases donde el bombo/graves se caen de golpe respecto a su entorno: el relleno de fin de frase."""
    g = F[:, 2]
    ref = median_filter(g, size=17, mode="nearest")
    return [int(i) for i in np.where(g < ref - 12)[0]]


def fase_local(cai, lo, hi, respaldo):
    ds = [d for d in cai if lo <= d < hi]
    if len(ds) >= 2:
        votos = np.bincount((np.array(ds) + 1) % BARS_BLOCK, minlength=BARS_BLOCK)
        if votos.max() >= max(2, 0.5 * len(ds)):
            return int(np.argmax(votos))
    return respaldo


def limpiar_actividad(activo, minimo=6):
    out = activo.copy()
    i = 0
    while i < len(out):
        if out[i]:
            j = i
            while j < len(out) and out[j]:
                j += 1
            if j - i < minimo:
                out[i:j] = False
            i = j
        else:
            i += 1
    return out


# ----------------------------------------------------------------------------- voz: entradas de frase
def entradas_voz(voz):
    """Momentos en que la voz EMPIEZA una frase tras un silencio: [(tiempo_s, hueco_previo_s)]."""
    y = voz.mean(1)
    hop = 256
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=hop)[0]
    dbv = 20 * np.log10(rms + 1e-6)
    ref = np.percentile(dbv, 90)
    act = dbv > ref - 16
    f = lambda ms: max(1, int(ms / 1000 * SR / hop))
    act = binary_closing(act, np.ones(f(70)))
    act = binary_opening(act, np.ones(f(60)))
    tt = librosa.frames_to_time(np.arange(len(act)), sr=SR, hop_length=hop)
    out = []
    for i in range(1, len(act)):
        if act[i] and not act[i - 1]:
            j = i - 1
            while j >= 0 and not act[j]:
                j -= 1
            gap = (i - 1 - j) * hop / SR if j >= 0 else 9.0
            out.append((float(tt[i]), float(gap)))
    return out


# ----------------------------------------------------------------------------- bloque de intro / estribillo
def bloque_ok(F, b):
    graves, ataques = F[:, 2], F[:, 4]
    ref_g, ref_a = np.percentile(graves, 60), np.percentile(ataques, 60)
    bl = slice(b, b + BARS_BLOCK)
    g, a = float(np.median(graves[bl])), float(np.median(ataques[bl]))
    hueco = float(np.min(F[b:b + BARS_BLOCK - 1, 1])) < np.median(F[:, 1]) - 12
    return (g >= ref_g - 6 and a >= 0.6 * ref_a and not hueco), dict(graves_db=round(g, 1), ataques=round(a, 2), hueco=bool(hueco))


def candidatos_entrada(F, grid, j0, n_bar, fase, entradas):
    """Lista ordenada de intros posibles: [(bloque, R, info)] — la primera es la sugerida."""
    T, T4 = grid["T"], 4 * grid["T"]
    out = []
    cand = [b for b in range(0, min(n_bar - BARS_BLOCK, 48)) if b == 0 or (b - fase) % BARS_BLOCK == 0]
    valid = []
    for b in cand:
        ok, info = bloque_ok(F, b)
        if ok:
            valid.append((b, info))
    usados = set()
    for b, info in valid[:6]:
        td = t_compas(grid, j0 + b)
        elegido = None
        for gap_min in (0.25, 0.10):
            cerca = [(t, g) for t, g in entradas if td - 2.0 * T4 <= t <= td + 2.2 * T and g >= gap_min]
            if cerca:
                t, g = max(cerca, key=lambda e: (round(min(e[1], 1.0), 1), -abs(e[0] - td)))
                elegido = (b, t - 0.015, dict(bloque=info, entrada_voz_s=round(t, 2), silencio_previo_s=round(min(g, 9.0), 2),
                                              anacrusa_tiempos=round((td - t) / T, 2)))
                break
        if elegido and b not in usados:
            usados.add(b)
            out.append(elegido)
    if valid:  # sin entrada clara: retomar en el inicio de compás
        b, info = valid[0]
        out.append((b, t_compas(grid, j0 + b), dict(bloque=info, entrada_voz_s=None, aviso="la voz es continua: se retoma en el compás")))
    if not out:
        out.append((0, t_compas(grid, j0), dict(aviso="sin bloque limpio")))
    return out


def rasgos_voz(voz, T, t0, j0, n_bar):
    y = voz.mean(1)
    hop = 1024
    ch = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=hop)
    mf = librosa.feature.mfcc(y=y, sr=SR, n_mfcc=13, hop_length=hop)
    X = np.vstack([ch, mf[1:] / 20])
    tt = librosa.frames_to_time(np.arange(X.shape[1]), sr=SR, hop_length=hop)
    B = np.zeros((n_bar * 4, X.shape[0]))
    for k in range(n_bar * 4):
        a = t0 + (j0 * 4 + k) * T
        m = (tt >= a) & (tt < a + T)
        if m.any():
            B[k] = X[:, m].mean(1)
    return (B - B.mean(0)) / (B.std(0) + 1e-6)


def similitud(B, n_bar):
    n = n_bar - W + 1
    V = np.array([B[c * 4:(c + W) * 4].ravel() for c in range(n)])
    V = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
    return V @ V.T


def tabla_estribillos(S, activo, fase, n_bar):
    n = len(S)
    tabla = {}
    for c in range(n):
        if (c - fase) % BARS_BLOCK != 0:
            continue
        otros = [S[c, j] for j in range(n) if abs(j - c) >= W]
        rep = float(max(otros)) if otros else 0.0
        dens = float(activo[c:c + W].mean())
        tabla[c] = dict(parecido=round(rep, 2), densidad_voz=round(dens, 2))
    return tabla


def elegir_estribillo(tabla, n_bar, umbral=0.6):
    buenos = [c for c, d in tabla.items() if d["parecido"] >= umbral and d["densidad_voz"] >= 0.6 and c >= 0.3 * n_bar]
    if buenos:
        c = max(buenos)
        return c, dict(metodo="último bloque repetido", **tabla[c])
    validos = [c for c, d in tabla.items() if d["densidad_voz"] >= 0.8]
    if validos:
        c = max(validos)
        return c, dict(metodo="último bloque con voz (sin repetición clara)", **tabla[c])
    return None, {}


# ----------------------------------------------------------------------------- sonoridad y picos
def sonoridad(x):
    return pyln.Meter(SR).integrated_loudness(x) if len(x) > SR // 2 else None


def nivelar(x, objetivo, tope_db):
    l = sonoridad(x)
    if l is None or not np.isfinite(l):
        return 1.0
    return float(10 ** (min(objetivo - l, tope_db) / 20))


def picos(x, pps=100, escala=None):
    """Mín/máx por ventana (pps ventanas por segundo), como int8 en base64 (min,max intercalados)."""
    m = x.mean(1) if x.ndim == 2 else x
    h = SR // pps
    n = len(m) // h
    v = m[: n * h].reshape(n, h)
    mn, mx = v.min(1), v.max(1)
    if escala is None:
        escala = max(float(np.abs(m).max()), 1e-6)
    q = np.stack([mn, mx], 1) / escala * 127
    q = np.clip(np.round(q), -127, 127).astype(np.int8)
    return dict(pps=pps, n=int(n), escala=float(escala), datos=base64.b64encode(q.tobytes()).decode("ascii"))


# ----------------------------------------------------------------------------- melodías que se repiten (para elegir la intro)
def candidatos_melodia(melodia, grid, j0, n_bar, F, fase, maximo=6):
    """Trozos de 8 compases cuya melodía/armonía (pista sin batería ni voz) se repite más a lo largo de la canción:
    suelen ser el gancho o el estribillo instrumental. Devuelve [{compas, start_s, repeticiones, energia_db}] ordenados."""
    y = melodia.mean(1)
    hop = 1024
    ch = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=hop)
    tt = librosa.frames_to_time(np.arange(ch.shape[1]), sr=SR, hop_length=hop)
    T, t0 = grid["T"], grid["t0"]
    B = np.zeros((n_bar * 4, 12))
    for k in range(n_bar * 4):
        a = t0 + (j0 * 4 + k) * T
        m = (tt >= a) & (tt < a + T)
        if m.any():
            B[k] = ch[:, m].mean(1)
    B = (B - B.mean(0)) / (B.std(0) + 1e-6)
    n = n_bar - W + 1
    if n < W + 1:
        return []
    V = np.array([B[c * 4:(c + W) * 4].ravel() for c in range(n)])
    V = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
    Sm = V @ V.T
    cand = [c for c in range(n) if (c - fase) % W == 0]
    ener = np.array([float(np.mean(F[c:c + W, 1])) for c in cand])
    emin, emax = ener.min(), ener.max()
    pts = []
    for c, e in zip(cand, ener):
        reps = sum(1 for j in cand if abs(j - c) >= W and Sm[c, j] >= 0.8)
        ok, _ = bloque_ok(F, c)
        score = reps + 1.5 * (e - emin) / (emax - emin + 1e-9) + (0.5 if ok else -1.0)
        pts.append((score, c, reps, e))
    pts.sort(reverse=True)
    out = []
    for score, c, reps, e in pts:
        if all(abs(c - o["compas"]) >= W for o in out):
            out.append(dict(compas=int(c), start_s=round(t_compas(grid, j0 + c), 4), repeticiones=int(reps) + 1, energia_db=round(e, 1)))
        if len(out) >= maximo:
            break
    return out
