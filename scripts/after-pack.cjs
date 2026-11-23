// En Apple Silicon toda app debe llevar al menos una firma "ad hoc" para poder abrirse.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log('  • firma ad hoc de', app)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
