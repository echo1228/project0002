import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getBuildExchangeConfig } from '../server/utils/config'
import type { BuildManifest } from '../server/utils/build-exchange'
import { buildDeck } from './build'

const workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`
const { exchangeRoot } = getBuildExchangeConfig()
const jobsRoot = resolve(exchangeRoot, 'jobs')
let stopping = false
let currentJobId: string | null = null

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o640 })
  await rename(temporary, path)
}

async function heartbeat(): Promise<void> {
  await mkdir(exchangeRoot, { recursive: true })
  await writeJsonAtomic(resolve(exchangeRoot, 'worker-heartbeat.json'), {
    workerId,
    lastSeenAt: new Date().toISOString(),
    currentJobId,
  })
}

async function recoverStaleJobs(): Promise<void> {
  await mkdir(jobsRoot, { recursive: true })
  const entries = await readdir(jobsRoot, { withFileTypes: true })
  const cutoff = Date.now() - 15 * 60_000
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const jobRoot = resolve(jobsRoot, entry.name)
    const building = resolve(jobRoot, 'building.json')
    const result = resolve(jobRoot, 'result.json')
    const buildingStat = await stat(building).catch(() => null)
    if (buildingStat && buildingStat.mtimeMs < cutoff && !await stat(result).catch(() => null)) {
      await rename(building, resolve(jobRoot, 'request.json')).catch(() => undefined)
    }
  }
}

async function claimJob(): Promise<{ manifest: BuildManifest, jobRoot: string } | null> {
  const entries = await readdir(jobsRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const jobRoot = resolve(jobsRoot, entry.name)
    const request = resolve(jobRoot, 'request.json')
    const building = resolve(jobRoot, 'building.json')
    try {
      await rename(request, building)
      const manifest = JSON.parse(await readFile(building, 'utf8')) as BuildManifest
      if (manifest.jobId !== entry.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.slug)) {
        throw new Error('构建任务清单无效')
      }
      return { manifest, jobRoot }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await writeJsonAtomic(resolve(jobRoot, 'result.json'), {
          ok: false,
          completedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : '构建任务清单无效',
        })
      }
    }
  }
  return null
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function run(): Promise<void> {
  await recoverStaleJobs()
  await heartbeat()
  console.log(JSON.stringify({ level: 'info', event: 'worker.started', workerId }))
  while (!stopping) {
    await heartbeat()
    const job = await claimJob()
    if (!job) {
      await sleep(2_000)
      continue
    }

    currentJobId = job.manifest.jobId
    await writeJsonAtomic(resolve(job.jobRoot, 'status.json'), {
      status: 'building',
      workerId,
      startedAt: new Date().toISOString(),
    })
    await heartbeat()
    console.log(JSON.stringify({ level: 'info', event: 'build.started', workerId, jobId: currentJobId }))
    try {
      await buildDeck({
        jobId: job.manifest.jobId,
        slug: job.manifest.slug,
        jobRoot: job.jobRoot,
        logPath: resolve(job.jobRoot, 'build.log'),
      })
      await writeJsonAtomic(resolve(job.jobRoot, 'result.json'), { ok: true, completedAt: new Date().toISOString() })
      console.log(JSON.stringify({ level: 'info', event: 'build.completed', workerId, jobId: currentJobId }))
    }
    catch (error) {
      await writeJsonAtomic(resolve(job.jobRoot, 'result.json'), {
        ok: false,
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      })
      console.error(JSON.stringify({ level: 'error', event: 'build.failed', workerId, jobId: currentJobId, error: error instanceof Error ? error.message : String(error) }))
    }
    currentJobId = null
    await heartbeat()
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopping = true })

run().catch((error) => {
  console.error(JSON.stringify({ level: 'fatal', event: 'worker.crashed', error: error instanceof Error ? error.stack : String(error) }))
  process.exitCode = 1
})
