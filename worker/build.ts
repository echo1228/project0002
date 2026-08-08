import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getBuildExchangeConfig, getServerConfig } from '../server/utils/config'

const PLATFORM_DEPENDENCIES = {
  '@slidev/cli': '52.19.0',
  '@slidev/theme-default': '0.25.0',
  '@slidev/theme-seriph': '0.25.0',
  'vue': '3.5.41',
}

const SECURITY_OVERRIDES = {
  '@hono/node-server': '2.1.0',
  'dompurify': '3.4.13',
}

export interface BuildInput {
  jobId: string
  slug: string
  jobRoot: string
  logPath: string
}

class BuildLog {
  private readonly stream
  private written = 0
  private truncated = false
  private readonly limit = 2 * 1024 * 1024

  constructor(path: string) {
    this.stream = createWriteStream(path, { flags: 'w', mode: 0o640 })
  }

  write(value: string | Buffer): void {
    if (this.truncated) return
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
    const remaining = this.limit - this.written
    if (remaining <= 0) {
      this.truncated = true
      this.stream.write('\n[日志已达到 2 MiB 上限，后续输出被截断]\n')
      return
    }
    const chunk = buffer.subarray(0, remaining)
    this.written += chunk.length
    this.stream.write(chunk)
    if (chunk.length < buffer.length) {
      this.truncated = true
      this.stream.write('\n[日志已达到 2 MiB 上限，后续输出被截断]\n')
    }
  }

  close(): Promise<void> {
    return new Promise((resolveDone, reject) => {
      this.stream.end(() => resolveDone())
      this.stream.on('error', reject)
    })
  }
}

function safePackageJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const pkg = { ...(value as Record<string, unknown>) }
  delete pkg.scripts
  delete pkg.publishConfig
  pkg.private = true
  pkg.name = typeof pkg.name === 'string' ? pkg.name : 'slidev-vault-deck'
  pkg.version = typeof pkg.version === 'string' ? pkg.version : '1.0.0'
  const dependencies = pkg.dependencies && typeof pkg.dependencies === 'object' && !Array.isArray(pkg.dependencies)
    ? { ...(pkg.dependencies as Record<string, string>) }
    : {}
  Object.assign(dependencies, PLATFORM_DEPENDENCIES)
  pkg.dependencies = dependencies
  delete pkg.devDependencies
  pkg.pnpm = { overrides: SECURITY_OVERRIDES }
  return pkg
}

async function preparePackage(source: string): Promise<void> {
  const packagePath = resolve(source, 'package.json')
  let current: unknown = {}
  try {
    current = JSON.parse(await readFile(packagePath, 'utf8'))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('package.json 不是有效的 JSON')
  }
  await writeFile(packagePath, `${JSON.stringify(safePackageJson(current), null, 2)}\n`, 'utf8')
}

async function runCommand(
  args: string[],
  cwd: string,
  log: BuildLog,
  timeoutMs: number,
): Promise<void> {
  log.write(`\n$ pnpm ${args.join(' ')}\n`)
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  await new Promise<void>((resolveDone, reject) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        HOME: process.env.HOME,
        CI: 'true',
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=768',
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
        NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      },
      windowsHide: true,
      shell: process.platform === 'win32',
    })
    child.stdout.on('data', chunk => log.write(chunk))
    child.stderr.on('data', chunk => log.write(chunk))

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
    }, timeoutMs)
    timer.unref()

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) reject(new Error(`命令执行超过 ${Math.ceil(timeoutMs / 1000)} 秒`))
      else if (code !== 0) reject(new Error(`命令失败（退出码 ${code ?? signal ?? 'unknown'}）`))
      else resolveDone()
    })
  })
}

export async function buildDeck(input: BuildInput): Promise<void> {
  const { pnpmStore } = getBuildExchangeConfig()
  const config = getServerConfig()
  const source = resolve(input.jobRoot, 'input')
  const output = resolve(input.jobRoot, 'output')
  await rm(output, { recursive: true, force: true })
  await mkdir(pnpmStore, { recursive: true })
  const log = new BuildLog(input.logPath)

  try {
    log.write(`[${new Date().toISOString()}] 开始构建 ${input.slug}\n`)
    await preparePackage(source)
    await runCommand([
      'install',
      '--ignore-scripts',
      '--no-frozen-lockfile',
      '--prefer-offline',
      '--store-dir', pnpmStore,
    ], source, log, config.buildTimeoutMs)
    await runCommand([
      'exec', 'slidev', 'build', 'slides.md',
      '--base', `/slides/${input.slug}/`,
      '--out', output,
      '--without-notes',
    ], source, log, config.buildTimeoutMs)
    log.write(`[${new Date().toISOString()}] 构建完成\n`)
  }
  finally {
    await log.close()
  }
}
