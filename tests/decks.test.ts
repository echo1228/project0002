import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase } from '../server/utils/db'
import { createRevisionFromUpload, listDecks, normalizeSlug, validateSlug } from '../server/utils/decks'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'slidev-vault-decks-'))
  process.env.NUXT_DATA_DIR = resolve(root, 'data')
  process.env.NUXT_BUILD_EXCHANGE_DIR = resolve(root, 'exchange')
})

afterEach(async () => {
  closeDatabase()
  delete process.env.NUXT_DATA_DIR
  delete process.env.NUXT_BUILD_EXCHANGE_DIR
  await rm(root, { recursive: true, force: true })
})

describe('deck lifecycle', () => {
  it('normalizes and validates stable slugs', () => {
    expect(normalizeSlug(' Quarterly Review 2026 ')).toBe('quarterly-review-2026')
    expect(validateSlug('quarterly-review-2026')).toBeNull()
    expect(validateSlug('../escape')).toBeTruthy()
    expect(validateSlug('api')).toBeTruthy()
  })

  it('creates a pending revision and an isolated exchange request', async () => {
    getDatabase()
    const created = await createRevisionFromUpload({
      title: 'Demo Deck',
      slug: 'demo-deck',
      filename: 'slides.md',
      buffer: Buffer.from('# Demo\n\n---\n\nSecond slide'),
    })
    const decks = listDecks()
    expect(decks).toHaveLength(1)
    expect(decks[0]?.latestRevision?.status).toBe('pending')
    const job = getDatabase().prepare('SELECT id FROM build_jobs WHERE revision_id = ?').get(created.revisionId) as { id: string }
    const requestPath = resolve(root, 'exchange', 'jobs', job.id, 'request.json')
    await expect(stat(requestPath)).resolves.toBeTruthy()
    const request = JSON.parse(await readFile(requestPath, 'utf8')) as { deckId: string, revisionId: string }
    expect(request).toMatchObject(created)
  })
})
