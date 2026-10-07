const { spawn } = require('node:child_process')

const host = process.env.DEV_HOST || '127.0.0.1'
const url = `http://${host}:5173`

console.log('')
console.log('[TEACH ELETRICY] Dev host:', host)
console.log('[TEACH ELETRICY] Interface:', url)
console.log('[TEACH ELETRICY] Para usar o IP da rede industrial:')
console.log('  set DEV_HOST=192.168.x.x && npm run dev')
console.log('')

const command =
  `npx concurrently -k "vite --host ${host}" "npx wait-on tcp:${host}:5173 && npx cross-env VITE_DEV_SERVER_URL=${url} electron ."`

const child = spawn(command, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

child.on('exit', (code) => process.exit(code ?? 0))
