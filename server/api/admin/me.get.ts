import { assertHost } from '../../utils/http'
import { requireSession } from '../../utils/auth'

export default defineEventHandler((event) => {
  assertHost(event, 'admin')
  requireSession(event, 'admin')
  return { authenticated: true }
})
