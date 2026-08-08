const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const { mkdirSync } = require('node:fs')
const { resolve } = require('node:path')
const { chromium } = require('playwright')

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3313'
const artifacts = resolve(process.env.E2E_ARTIFACTS || 'data/e2e-browser-artifacts')
mkdirSync(artifacts, { recursive: true })

const workerCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const worker = spawn(workerCommand, ['exec', 'tsx', 'worker/index.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    BUILD_EXCHANGE_DIR: process.env.E2E_EXCHANGE_DIR,
    PNPM_STORE_DIR: process.env.E2E_PNPM_STORE,
  },
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

;(async () => {
let browser
try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  const discovery = await page.locator('a, button, input').evaluateAll(elements => elements.map(element => ({
    tag: element.tagName,
    text: element.textContent?.trim(),
    name: element.getAttribute('name'),
    type: element.getAttribute('type'),
  })))
  console.log(JSON.stringify({ discovery }))
  await page.screenshot({ path: resolve(artifacts, '01-login.png'), fullPage: true })

  await page.getByLabel('管理密码').fill('admin-browser-password-123')
  await page.getByRole('button', { name: '进入控制台' }).click()
  await page.waitForURL(`${base}/`)
  await page.getByRole('heading', { name: '幻灯片库' }).waitFor()

  await page.getByLabel(/选择 .md 或 .zip/).setInputFiles({
    name: 'browser-demo.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('---\ntitle: Browser Demo\ntheme: default\n---\n\n# Browser E2E Demo\n\nVerified in Playwright.\n\n---\n\n# Ready\n'),
  })
  await page.getByLabel('标题').fill('Browser E2E Demo')
  await page.getByLabel('短链接').fill('browser-e2e-demo')
  await page.getByRole('button', { name: '上传并构建' }).click()
  await page.getByText('Browser E2E Demo', { exact: true }).waitFor({ timeout: 20_000 })
  await page.getByText('可访问', { exact: true }).waitFor({ timeout: 180_000 })
  await page.screenshot({ path: resolve(artifacts, '02-dashboard.png'), fullPage: true })

  const popupPromise = context.waitForEvent('page')
  await page.getByRole('link', { name: '打开' }).click()
  const slidesPage = await popupPromise
  await slidesPage.waitForLoadState('domcontentloaded')
  await slidesPage.getByLabel('访问密码').fill('viewer-browser-password')
  await slidesPage.getByRole('button', { name: '开启幻灯片' }).click()
  await slidesPage.waitForURL(/\/slides\/browser-e2e-demo\//, { timeout: 20_000 })
  await slidesPage.getByText('Browser E2E Demo', { exact: true }).waitFor({ timeout: 20_000 })
  await slidesPage.screenshot({ path: resolve(artifacts, '03-slide.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: resolve(artifacts, '04-dashboard-mobile.png'), fullPage: true })

  assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join('\n')}`)
  console.log(JSON.stringify({ ok: true, screenshots: artifacts }))
}
finally {
  await browser?.close()
  if (process.platform === 'win32' && worker.pid) {
    spawnSync('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], { stdio: 'ignore' })
  }
  else {
    worker.kill('SIGTERM')
  }
}
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
