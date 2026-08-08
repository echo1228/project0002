import { randomUUID } from 'node:crypto'
import { cp, mkdir, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DeckSummary } from '../../shared/types'
import { extractUpload, sha256Buffer } from './archive'
import { getBuildExchangeConfig, getDataPaths } from './config'
import { getDatabase, nowIso } from './db'
import { enqueueExchangeJob } from './build-exchange'

interface DeckRow {
  id: string
  slug: string
  title: string
  active_revision_id: string | null
  created_at: string
  updated_at: string
}

interface RevisionRow {
  id: string
  deck_id: string
  status: 'pending' | 'building' | 'ready' | 'failed'
  created_at: string
  completed_at: string | null
  error: string | null
}

export function normalizeSlug(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function validateSlug(slug: string): string | null {
  if (slug.length < 2 || slug.length > 64) return '短链接需要 2–64 个字符'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return '短链接只能包含小写字母、数字和连字符'
  if (['api', 'login', 'unlock', 'healthz', 'readyz', 'slides'].includes(slug)) return '该短链接为系统保留字'
  return null
}

export async function createRevisionFromUpload(input: {
  title: string
  slug: string
  filename: string
  buffer: Buffer
}): Promise<{ deckId: string, revisionId: string }> {
  const db = getDatabase()
  const now = nowIso()
  const existing = db.prepare('SELECT * FROM decks WHERE slug = ?').get(input.slug) as DeckRow | undefined
  const deckId = existing?.id || randomUUID()
  const revisionId = randomUUID()
  const jobId = randomUUID()
  const paths = getDataPaths()
  const staging = resolve(paths.work, `upload-${revisionId}`)
  const source = resolve(paths.sources, deckId, revisionId)

  await extractUpload(input.buffer, input.filename, staging)
  await mkdir(resolve(paths.sources, deckId), { recursive: true })
  await rename(staging, source)

  try {
    db.transaction(() => {
      if (existing) {
        db.prepare('UPDATE decks SET title = ?, updated_at = ? WHERE id = ?').run(input.title, now, deckId)
      }
      else {
        db.prepare(`
          INSERT INTO decks (id, slug, title, active_revision_id, created_at, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?)
        `).run(deckId, input.slug, input.title, now, now)
      }
      db.prepare(`
        INSERT INTO deck_revisions (id, deck_id, source_sha256, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `).run(revisionId, deckId, sha256Buffer(input.buffer), now)
      db.prepare(`
        INSERT INTO build_jobs (id, revision_id, status, available_at)
        VALUES (?, ?, 'pending', ?)
      `).run(jobId, revisionId, now)
    })()
  }
  catch (error) {
    await rm(source, { recursive: true, force: true })
    throw error
  }
  await enqueueExchangeJob({ jobId, deckId, revisionId, slug: input.slug, createdAt: now }).catch(error => console.error(JSON.stringify({
    level: 'error', event: 'build_exchange.enqueue_failed', jobId, error: error instanceof Error ? error.message : String(error),
  })))
  return { deckId, revisionId }
}

export function listDecks(): DeckSummary[] {
  const db = getDatabase()
  const decks = db.prepare('SELECT * FROM decks ORDER BY updated_at DESC').all() as DeckRow[]
  const latest = db.prepare(`
    SELECT id, deck_id, status, created_at, completed_at, error
    FROM deck_revisions WHERE deck_id = ? ORDER BY created_at DESC LIMIT 1
  `)
  return decks.map((deck) => {
    const revision = latest.get(deck.id) as RevisionRow | undefined
    return {
      id: deck.id,
      slug: deck.slug,
      title: deck.title,
      activeRevisionId: deck.active_revision_id,
      createdAt: deck.created_at,
      updatedAt: deck.updated_at,
      latestRevision: revision ? {
        id: revision.id,
        status: revision.status,
        createdAt: revision.created_at,
        completedAt: revision.completed_at,
        error: revision.error,
      } : null,
    }
  })
}

export function getDeckBySlug(slug: string): DeckRow | undefined {
  return getDatabase().prepare('SELECT * FROM decks WHERE slug = ?').get(slug) as DeckRow | undefined
}

export function getDeckById(id: string): DeckRow | undefined {
  return getDatabase().prepare('SELECT * FROM decks WHERE id = ?').get(id) as DeckRow | undefined
}

export async function queueRebuild(deckId: string): Promise<string> {
  const db = getDatabase()
  const sourceRevision = db.prepare(`
    SELECT id FROM deck_revisions WHERE deck_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(deckId) as { id: string } | undefined
  if (!sourceRevision) throw new Error('SOURCE_NOT_FOUND')

  const revisionId = randomUUID()
  const jobId = randomUUID()
  const paths = getDataPaths()
  const source = resolve(paths.sources, deckId, sourceRevision.id)
  const destination = resolve(paths.sources, deckId, revisionId)
  await cp(source, destination, { recursive: true, errorOnExist: true })

  const now = nowIso()
  try {
    db.transaction(() => {
      const sha = db.prepare('SELECT source_sha256 FROM deck_revisions WHERE id = ?').get(sourceRevision.id) as { source_sha256: string }
      db.prepare(`
        INSERT INTO deck_revisions (id, deck_id, source_sha256, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `).run(revisionId, deckId, sha.source_sha256, now)
      db.prepare(`
        INSERT INTO build_jobs (id, revision_id, status, available_at)
        VALUES (?, ?, 'pending', ?)
      `).run(jobId, revisionId, now)
      db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(now, deckId)
    })()
  }
  catch (error) {
    await rm(destination, { recursive: true, force: true })
    throw error
  }
  const deck = getDeckById(deckId)!
  await enqueueExchangeJob({ jobId, deckId, revisionId, slug: deck.slug, createdAt: now }).catch(error => console.error(JSON.stringify({
    level: 'error', event: 'build_exchange.enqueue_failed', jobId, error: error instanceof Error ? error.message : String(error),
  })))
  return revisionId
}

export async function deleteDeck(deckId: string): Promise<boolean> {
  const db = getDatabase()
  const deck = getDeckById(deckId)
  if (!deck) return false
  const jobs = db.prepare(`
    SELECT j.id FROM build_jobs j
    JOIN deck_revisions r ON r.id = j.revision_id
    WHERE r.deck_id = ? AND j.status IN ('pending', 'building')
  `).all(deckId) as Array<{ id: string }>
  db.prepare('DELETE FROM decks WHERE id = ?').run(deckId)
  const paths = getDataPaths()
  await Promise.all([
    rm(resolve(paths.sources, deckId), { recursive: true, force: true }),
    rm(resolve(paths.published, deckId), { recursive: true, force: true }),
    ...jobs.map(job => rm(resolve(getBuildExchangeConfig().exchangeRoot, 'jobs', job.id), { recursive: true, force: true })),
  ])
  return true
}

export function getRevisionLogPath(revisionId: string): string {
  return resolve(getDataPaths().logs, `${revisionId}.log`)
}
