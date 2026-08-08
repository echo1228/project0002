import { readBody } from 'h3'
import { assertHost, assertSameOrigin } from '../../utils/http'
import { audit, changePassword, requireSession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertHost(event, 'admin')
  assertSameOrigin(event)
  requireSession(event, 'admin')
  const body = await readBody<{ password?: unknown }>(event)
  const password = typeof body?.password === 'string' ? body.password : ''
  await changePassword('viewer', password)
  audit(event, 'admin', 'viewer.password.change', 'success')
  return { ok: true, sessionsRevoked: true }
})
