import { assertHost, assertSameOrigin } from '../../utils/http'
import { audit, revokeCurrentSession } from '../../utils/auth'

export default defineEventHandler((event) => {
  assertHost(event, 'admin')
  assertSameOrigin(event)
  revokeCurrentSession(event, 'admin')
  audit(event, 'admin', 'admin.logout', 'success')
  return { ok: true }
})
