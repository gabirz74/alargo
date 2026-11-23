# Alargo

Crea versiones **extended** de tus canciones para mezclar: una intro instrumental con ritmo, la canción entera y un final con la **acapela** del último estribillo. Todo se hace en tu ordenador, con modelos de IA de código abierto, sin cuentas, sin límites y sin pagar nada.

Funciona en **macOS** (Apple Silicon e Intel) y **Windows 10/11**.

## Cómo funciona

1. **Suelta una canción** (MP3, WAV, FLAC, M4A, OGG…). Puedes soltar varias: se analizan en cola.
2. Alargo la **analiza**:
   - separa la voz, la batería, el bajo y el resto con modelos locales (BS-Roformer y Demucs);
   - detecta el tempo y coloca una rejilla de compases con precisión de milisegundos;
   - encuentra dónde entra cada frase cantada y qué estribillo se repite (el último será la acapela).
3. Te propone un extended (la **sugerencia IA**) y lo **escuchas al momento**.
4. Lo ajustas todo a tu gusto: arrastra marcadores en la línea de tiempo o usa los controles. Escucha cada empalme por separado.
5. **Exportas** a MP3, WAV o FLAC, con etiquetas (título, artista y BPM) y la **portada** de la canción original (igual, con una franja «EXTENDED» o sin ella).

## Qué puedes personalizar

| Zona | Controles |
| --- | --- |
| Intro | activar/desactivar · sonido (instrumental completo, solo batería, batería y bajo) · duración (4–16 compases) · bucle de 1/2/4 compases · trozo que suena (arrastrable, elegido con el ratón o entre las melodías que más se repiten) · mezcla por capas (batería, bajo, melodía y voz de adelanto de partes distintas) · volumen automático o manual · entrada suave · compás extra automático o manual |
| Entrada de la canción | dónde retoma la canción (arrastrable) · ajuste fino de ±10 ms y ±1 tiempo · entradas de voz detectadas |
| Cortar partes | quita cualquier trozo de tu extended ya montado (intro, canción o acapela) marcándolo con el ratón en la pista de abajo, o los huecos sin sonido con un clic; con horas exactas editables |
| Acapela final | activar/desactivar · posición (arrastrable, de compás en compás) · estribillos detectados · duración (4/8/16/32 compases) · volumen · cuánto tarda en apagarse el instrumental · fundido final |
| Línea de tiempo | rejilla de tiempos estilo DJ (primer tiempo de cada compás en rojo) · onda por voz o por frecuencias (graves, medios, agudos) · minimapa · zoom hasta el milisegundo · imán Auto / Compás / Tiempo / Libre (Alt = libre) · hora exacta editable · seguir el cursor opcional · pistas altas · panel ocultable |
| Ritmo | tempo detectado · afinado de la rejilla en milisegundos · desplazar la rejilla un tiempo |
| Efectos de DJ | estilos Sin efectos / Suave / Intenso / Épico (reggaetón y club) y cada efecto por separado. Entrada: filtro que se abre, crescendo, bombo extra, bombeo, subida de ruido, platillo invertido, sirena, tartamudeo, freno de vinilo, silencio antes de la voz, redoble de caja, golpe de entrada, caída de graves, más batería. Antes de la acapela (acaban justo donde entra ella): canción que se apaga, subida de ruido, platillo invertido, sirena, redoble, silencio, freno de vinilo, tartamudeo, eco, golpe y caída de graves. Salida: eco, reverb, filtro que se cierra, batería de fondo, voz cortada al ritmo, freno de vinilo, golpe final |
| Sonido | fundido en las uniones (0–100 ms) · limitador suave |
| General | deshacer/rehacer · volver a la sugerencia IA · zoom · previsualización fiel (lo que oyes es lo que exportas) |

## Primer arranque y espacio en disco

La instalación de la app pesa poco (unos 150 MB). La **primera vez** descarga su motor de IA, una sola vez:

| | Calidad alta | Rápida |
| --- | --- | --- |
| Python + librerías | ≈ 1,1 GB | ≈ 1,1 GB |
| Modelos | ≈ 1,0 GB | ≈ 0,4 GB |

Cada canción analizada guarda sus pistas separadas (unos 80–150 MB) para poder editarla; se liberan al quitar la canción de la biblioteca. En *Ajustes → Espacio en disco* puedes ver cuánto ocupa todo y desinstalar el motor.

## Instalación

- **macOS**: abre el `.dmg` y arrastra Alargo a Aplicaciones. La app no está notarizada; la primera vez haz clic derecho → *Abrir*, o ejecuta `xattr -dr com.apple.quarantine /Applications/Alargo.app`.
- **Windows**: ejecuta `Alargo-Setup-x.y.z.exe`. SmartScreen puede avisar porque el instalador no está firmado: *Más información → Ejecutar de todas formas*.

## Para desarrolladores

```bash
npm install
npm run dev          # interfaz con recarga en caliente
npm run typecheck
npm run test:engine  # pruebas del motor (necesita las dependencias de engine/requirements.txt)
```

- `src/main`, `src/preload`, `src/renderer`: app de Electron + React + Tailwind.
- `engine/alargo_engine`: motor en Python (análisis, montaje, exportación). Habla con la app por JSON-lines (`python -m alargo_engine`).
- El motor se instala con [`uv`](https://github.com/astral-sh/uv) (empaquetado en la app) en la carpeta de datos de la aplicación.
- Variables útiles en desarrollo: `ALARGO_HOME` (carpeta de datos), `ALARGO_PYTHON` (usar un Python ya preparado), `ALARGO_MODELS`, `ALARGO_UV`.
- Los instaladores se construyen en GitHub Actions al crear una etiqueta `vX.Y.Z`.

## Licencias

El código de Alargo es MIT. Los modelos (BS-Roformer, Demucs, Beat This!) y sus librerías tienen sus propias licencias de código abierto y se descargan de sus fuentes oficiales.
