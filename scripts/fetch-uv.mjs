// Descarga el instalador de paquetes `uv` (Astral) para la plataforma de destino y lo deja en resources/uv/.
// Uso: node scripts/fetch-uv.mjs [darwin|win32] [arm64|x64]
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const UV_VERSION = '0.13.9'
const plataforma = process.argv[2] ?? process.platform
const arch = process.argv[3] ?? process.arch
const objetivos = {
  'darwin-arm64': ['uv-aarch64-apple-darwin', 'tar.gz', 'uv'],
  'darwin-x64': ['uv-x86_64-apple-darwin', 'tar.gz', 'uv'],
  'win32-x64': ['uv-x86_64-pc-windows-msvc', 'zip', 'uv.exe']
}
const objetivo = objetivos[`${plataforma}-${arch}`]
if (!objetivo) throw new Error(`Plataforma no soportada: ${plataforma}-${arch}`)
const [nombre, ext, exe] = objetivo
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const destino = join(raiz, 'resources', 'uv')
const base = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${nombre}.${ext}`

async function bajar(url) {
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

const datos = await bajar(base)
const esperado = (await bajar(base + '.sha256')).toString().trim().split(/\s+/)[0]
const real = createHash('sha256').update(datos).digest('hex')
if (esperado !== real) throw new Error(`Suma de comprobación incorrecta para ${nombre}: ${real} != ${esperado}`)

const tmp = mkdtempSync(join(tmpdir(), 'uv-'))
const paquete = join(tmp, `uv.${ext}`)
writeFileSync(paquete, datos)
execFileSync('tar', ['-xf', paquete, '-C', tmp])
const buscar = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) {
      const r = buscar(p)
      if (r) return r
    } else if (e.name === exe) return p
  }
  return null
}
const encontrado = buscar(tmp)
if (!encontrado) throw new Error('No se encontró ' + exe + ' en el paquete')
rmSync(destino, { recursive: true, force: true })
mkdirSync(destino, { recursive: true })
copyFileSync(encontrado, join(destino, exe))
if (plataforma !== 'win32') chmodSync(join(destino, exe), 0o755)
rmSync(tmp, { recursive: true, force: true })
console.log(`uv ${UV_VERSION} (${nombre}) listo en resources/uv/${exe}  sha256=${real.slice(0, 12)}…`)
