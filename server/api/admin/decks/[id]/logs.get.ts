import { readFile } from 'node:fs/promises'
import { getDatabase } from '../../../../utils/db'
import { getRevisionLogPath } from '../../../../utils/decks'
import { apiError, assertHost } from '../../../../utils/http'
import { requireSession } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  assertHost(event, 'admin')
  requireSession(event, 'admin')
  const id = getRouterParam(event, 'id') || ''
  const revision = getDatabase().prepare(`
    SELECT id FROM deck_revisions WHERE deck_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(id) as { id: string } | undefined
  if (!revision) apiError(404, 'LOG_NOT_FOUND', '尚无构建日志')
  try {
    return { revisionId: revision.id, log: await readFile(getRevisionLogPath(revision.id), 'utf8') }
  }
  catch {
    return { revisionId: revision.id, log: '构建任务正在等待 Worker…' }
  }
})
