import { audit, requireSession } from '../../../utils/auth'
import { deleteDeck } from '../../../utils/decks'
import { apiError, assertHost, assertSameOrigin } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  assertHost(event, 'admin')
  assertSameOrigin(event)
  requireSession(event, 'admin')
  const id = getRouterParam(event, 'id') || ''
  if (!await deleteDeck(id)) apiError(404, 'DECK_NOT_FOUND', '没有找到该幻灯片')
  audit(event, 'admin', 'deck.delete', 'success', id)
  return { ok: true }
})
