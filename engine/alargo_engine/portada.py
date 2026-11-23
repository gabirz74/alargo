"""Portada del álbum: se extrae de la canción original y se pone en el archivo exportado (con marca opcional)."""
import os

from .common import run_ffmpeg


def extraer(entrada, destino):
    """Guarda la portada incrustada en `entrada` como JPEG (máx. 1400 px). Devuelve True si había portada."""
    try:
        run_ffmpeg(["-i", entrada, "-an", "-frames:v", "1", "-vf", "scale='min(1400,iw)':-2", "-q:v", "2", destino])
    except Exception:  # noqa: BLE001  (sin portada: ffmpeg no encuentra vídeo)
        return False
    return os.path.exists(destino) and os.path.getsize(destino) > 500


def con_marca(origen, destino, texto="EXTENDED"):
    """Copia la portada añadiendo una franja inferior con la palabra EXTENDED."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.open(origen).convert("RGB")
    w, h = img.size
    banda = max(24, int(h * 0.13))
    capa = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    d.rectangle((0, h - banda, w, h), fill=(8, 10, 20, 190))
    d.rectangle((0, h - banda, w, h - banda + max(2, h // 300)), fill=(110, 118, 255, 255))
    try:
        fuente = ImageFont.load_default(size=int(banda * 0.5))
    except TypeError:  # Pillow antiguo
        fuente = ImageFont.load_default()
    # texto con espaciado entre letras
    sep = max(2, int(banda * 0.12))
    anchos = [d.textlength(c, font=fuente) for c in texto]
    total = sum(anchos) + sep * (len(texto) - 1)
    x = (w - total) / 2
    y = h - banda / 2
    for c, a in zip(texto, anchos):
        d.text((x, y), c, font=fuente, fill=(255, 255, 255, 255), anchor="lm")
        x += a + sep
    Image.alpha_composite(img.convert("RGBA"), capa).convert("RGB").save(destino, "JPEG", quality=92)
