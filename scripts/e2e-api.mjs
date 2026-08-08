import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3310'
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin-e2e-password-123'
const viewerPassword = process.env.E2E_VIEWER_PASSWORD || 'viewer-e2e-password'
const worker = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'worker/index.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    BUILD_EXCHANGE_DIR: process.env.E2E_EXCHANGE_DIR,
    PNPM_STORE_DIR: process.env.E2E_PNPM_STORE,
  },
  stdio: 'inherit',
})

function cookieFrom(response) {
  const value = response.headers.get('set-cookie')
  assert.ok(value, 'response did not set a cookie')
  return value.split(';', 1)[0]
}

async function json(response) {
  const body = await response.json().catch(() => ({}))
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(body)}`)
  return body
}

try {
await json(await fetch(`${base}/readyz`))

const adminLogin = await fetch(`${base}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ password: adminPassword }),
})
await json(adminLogin)
const adminCookie = cookieFrom(adminLogin)

const form = new FormData()
form.set('title', 'E2E Verification Deck')
form.set('slug', 'e2e-verification')
form.set('file', new Blob([`---\ntitle: E2E Verification\ntheme: default\n---\n\n# E2E Verification\n\nA real Slidev build.\n\n---\n\n# Second slide\n\nBuild and auth are working.\n`], { type: 'text/markdown' }), 'slides.md')
await json(await fetch(`${base}/api/admin/decks`, {
  method: 'POST',
  headers: { cookie: adminCookie, origin: base },
  body: form,
}))

let deck
for (let attempt = 0; attempt < 90; attempt += 1) {
  const result = await json(await fetch(`${base}/api/admin/decks`, { headers: { cookie: adminCookie } }))
  deck = result.decks.find(item => item.slug === 'e2e-verification')
  if (deck?.latestRevision?.status === 'ready') break
  if (deck?.latestRevision?.status === 'failed') throw new Error(`Slidev build failed: ${deck.latestRevision.error}`)
  await new Promise(resolve => setTimeout(resolve, 2_000))
}
assert.equal(deck?.latestRevision?.status, 'ready', 'Slidev build did not complete')

const locked = await fetch(`${base}/slides/e2e-verification/`, {
  redirect: 'manual',
  headers: { accept: 'text/html' },
})
assert.equal(locked.status, 302)
assert.match(locked.headers.get('location') || '', /^\/unlock\?next=/)

const viewerLogin = await fetch(`${base}/api/viewer/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ password: viewerPassword, next: '/slides/e2e-verification/' }),
})
await json(viewerLogin)
const viewerCookie = cookieFrom(viewerLogin)

const slides = await fetch(`${base}/slides/e2e-verification/`, { headers: { cookie: viewerCookie, accept: 'text/html' } })
assert.equal(slides.status, 200)
assert.match(slides.headers.get('content-type') || '', /text\/html/)
assert.match(await slides.text(), /Slidev/i)

console.log(JSON.stringify({ ok: true, deckId: deck.id, status: deck.latestRevision.status }))
}
finally {
  if (process.platform === 'win32' && worker.pid) {
    spawnSync('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], { stdio: 'ignore' })
  }
  else {
    worker.kill('SIGTERM')
  }
}
