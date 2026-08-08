import { requireSession } from '../../../utils/auth'
import { assertHost } from '../../../utils/http'
import { listDecks } from '../../../utils/decks'

export default defineEventHandler((event) => {
  assertHost(event, 'admin')
  requireSession(event, 'admin')
  return { decks: listDecks() }
})
