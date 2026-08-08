import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'slidev-vault-e2e-'))
const dataDir = join(root, 'data')
const exchangeDir = join(root, 'exchange')
const pnpmStore = join(root, 'pnpm-store')
const port = process.env.E2E_PORT || '3315'
const baseUrl = `http://127.0.0.1:${port}`
mkdirSync(dataDir, { recursive: true })
mkdirSync(exchangeDir, { recursive: true })
mkdirSync(pnpmStore, { recursive: true })

const environment = {
  ...process.env,
  NODE_ENV: 'production',
  NITRO_HOST: '127.0.0.1',
  NITRO_PORT: port,
  NUXT_DATA_DIR: dataDir,
  NUXT_BUILD_EXCHANGE_DIR: exchangeDir,
  NUXT_COOKIE_SECURE: 'false',
  NUXT_INITIAL_ADMIN_PASSWORD: 'admin-e2e-password-123',
  NUXT_INITIAL_VIEWER_PASSWORD: 'viewer-e2e-password',
  E2E_BASE_URL: baseUrl,
  E2E_EXCHANGE_DIR: exchangeDir,
  E2E_PNPM_STORE: pnpmStore,
}

let stdout = ''
let stderr = ''
let succeeded = false
const app = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: process.cwd(),
  env: environment,
  stdio: ['ignore', 'pipe', 'pipe'],
})

app.stdout.on('data', (chunk) => { stdout += chunk })
app.stderr.on('data', (chunk) => { stderr += chunk })

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (app.exitCode !== null) throw new Error(`Application exited with code ${app.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/readyz`)
      if (response.ok) return
    }
    catch {
      // Expected while the production server starts.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Production server did not become ready')
}

try {
  await waitUntilReady()
  const result = spawnSync(process.execPath, ['scripts/e2e-api.mjs'], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
    timeout: 180_000,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`E2E flow exited with code ${result.status}`)
  succeeded = true
}
finally {
  if (process.platform === 'win32' && app.pid) {
    spawnSync('taskkill.exe', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  }
  else {
    app.kill('SIGTERM')
  }

  if (succeeded) {
    rmSync(root, { recursive: true, force: true })
  }
  else {
    console.error(stdout)
    console.error(stderr)
    console.error(`E2E artifacts: ${root}`)
  }
}
