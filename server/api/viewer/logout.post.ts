import { audit, revokeCurrentSession } from '../../utils/auth'
import { assertHost, assertSameOrigin } from '../../utils/http'

export default defineEventHandler((event) => {
  assertHost(event, 'viewer')
  assertSameOrigin(event)
  revokeCurrentSession(event, 'viewer')
  audit(event, 'viewer', 'viewer.logout', 'success')
  return { ok: true }
})
