import { randomUUID } from 'node:crypto'
import { access, cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getBuildExchangeConfig, getDataPaths } from './config'
import { getDatabase, nowIso } from './db'

export interface BuildManifest {
  jobId: string
  deckId: string
  revisionId: string
  slug: string
  createdAt: string
}

interface PendingJobRow {
  job_id: string
  revision_id: string
  deck_id: string
  slug: string
  status: 'pending' | 'building'
}

interface BuildResult {
  ok: boolean
  completedAt: string
  error?: string
}

interface WorkerHeartbeat {
  workerId: string
  lastSeenAt: string
  currentJobId: string | null
}

let syncing = false

export function exchangeJobPath(jobId: string): string {
  return resolve(getBuildExchangeConfig().exchangeRoot, 'jobs', jobId)
}

export async function enqueueExchangeJob(manifest: BuildManifest): Promise<void> {
  const { exchangeRoot } = getBuildExchangeConfig()
  const jobsRoot = resolve(exchangeRoot, 'jobs')
  const destination = exchangeJobPath(manifest.jobId)
  await mkdir(jobsRoot, { recursive: true })
  if (await stat(destination).catch(() => null)) return

  const staging = resolve(jobsRoot, `.enqueue-${manifest.jobId}-${randomUUID()}`)
  try {
    await mkdir(staging, { recursive: true })
    await cp(resolve(getDataPaths().sources, manifest.deckId, manifest.revisionId), resolve(staging, 'input'), {
      recursive: true,
      errorOnExist: true,
    })
    await writeFile(resolve(staging, 'request.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o640 })
    await rename(staging, destination)
  }
  catch (error) {
    await rm(staging, { recursive: true, force: true })
    if (await stat(destination).catch(() => null)) return
    throw error
  }
}

async function copyBuildLog(jobPath: string, revisionId: string): Promise<void> {
  const source = resolve(jobPath, 'build.log')
  await mkdir(getDataPaths().logs, { recursive: true })
  await cp(source, resolve(getDataPaths().logs, `${revisionId}.log`), { force: true }).catch(() => undefined)
}

async function finalizeSuccess(job: PendingJobRow, jobPath: string): Promise<void> {
  const paths = getDataPaths()
  const output = resolve(jobPath, 'output')
  await access(resolve(output, 'index.html'))
  const parent = resolve(paths.published, job.deck_id)
  const destination = resolve(parent, job.revision_id)
  const staging = resolve(parent, `.${job.revision_id}.tmp-${randomUUID()}`)
  await mkdir(parent, { recursive: true })
  await rm(staging, { recursive: true, force: true })
  await cp(output, staging, { recursive: true, errorOnExist: true })
  await rm(destination, { recursive: true, force: true })
  await rename(staging, destination)
  await copyBuildLog(jobPath, job.revision_id)

  const completedAt = nowIso()
  const db = getDatabase()
  db.transaction(() => {
    db.prepare(`UPDATE build_jobs SET status = 'ready', last_error = NULL WHERE id = ?`).run(job.job_id)
    db.prepare(`UPDATE deck_revisions SET status = 'ready', completed_at = ?, error = NULL WHERE id = ?`).run(completedAt, job.revision_id)
    db.prepare(`UPDATE decks SET active_revision_id = ?, updated_at = ? WHERE id = ?`).run(job.revision_id, completedAt, job.deck_id)
  })()
}

async function finalizeFailure(job: PendingJobRow, jobPath: string, error: string): Promise<void> {
  await copyBuildLog(jobPath, job.revision_id)
  const message = error.slice(0, 1000)
  const completedAt = nowIso()
  const db = getDatabase()
  db.transaction(() => {
    db.prepare(`UPDATE build_jobs SET status = 'failed', last_error = ? WHERE id = ?`).run(message, job.job_id)
    db.prepare(`UPDATE deck_revisions SET status = 'failed', completed_at = ?, error = ? WHERE id = ?`).run(completedAt, message, job.revision_id)
    db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(completedAt, job.deck_id)
  })()
}

export async function syncBuildExchange(): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const db = getDatabase()
    const jobs = db.prepare(`
      SELECT j.id AS job_id, j.revision_id, j.status, r.deck_id, d.slug
      FROM build_jobs j
      JOIN deck_revisions r ON r.id = j.revision_id
      JOIN decks d ON d.id = r.deck_id
      WHERE j.status IN ('pending', 'building')
      ORDER BY j.available_at ASC
    `).all() as PendingJobRow[]

    for (const job of jobs) {
      const jobPath = exchangeJobPath(job.job_id)
      const resultPath = resolve(jobPath, 'result.json')
      const statusPath = resolve(jobPath, 'status.json')
      const result = await readJson<BuildResult>(resultPath)
      if (result) {
        try {
          if (result.ok) await finalizeSuccess(job, jobPath)
          else await finalizeFailure(job, jobPath, result.error || '构建失败')
        }
        catch (error) {
          await finalizeFailure(job, jobPath, error instanceof Error ? `发布失败：${error.message}` : '发布失败')
        }
        await rm(jobPath, { recursive: true, force: true })
        continue
      }

      if (await stat(statusPath).catch(() => null)) {
        if (job.status === 'pending') {
          db.transaction(() => {
            db.prepare(`UPDATE build_jobs SET status = 'building', locked_at = ? WHERE id = ?`).run(nowIso(), job.job_id)
            db.prepare(`UPDATE deck_revisions SET status = 'building', error = NULL WHERE id = ?`).run(job.revision_id)
          })()
        }
      }
      else {
        await enqueueExchangeJob({
          jobId: job.job_id,
          deckId: job.deck_id,
          revisionId: job.revision_id,
          slug: job.slug,
          createdAt: nowIso(),
        })
      }
    }
  }
  finally {
    syncing = false
  }
}

export async function getWorkerHeartbeat(): Promise<WorkerHeartbeat | null> {
  return readJson<WorkerHeartbeat>(resolve(getBuildExchangeConfig().exchangeRoot, 'worker-heartbeat.json'))
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  }
  catch {
    return null
  }
}
