import { audit, requireSession } from '../../../../utils/auth'
import { getDeckById, queueRebuild } from '../../../../utils/decks'
import { apiError, assertHost, assertSameOrigin } from '../../../../utils/http'

export default defineEventHandler(async (event) => {
  assertHost(event, 'admin')
  assertSameOrigin(event)
  requireSession(event, 'admin')
  const id = getRouterParam(event, 'id') || ''
  if (!getDeckById(id)) apiError(404, 'DECK_NOT_FOUND', '没有找到该幻灯片')
  const revisionId = await queueRebuild(id)
  audit(event, 'admin', 'deck.rebuild', 'success', id, { revisionId })
  return { ok: true, revisionId }
})
