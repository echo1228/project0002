import { readBody } from 'h3'
import { assertHost, assertSameOrigin, apiError } from '../../utils/http'
import { audit, authenticate, changePassword, requireSession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  assertHost(event, 'admin')
  assertSameOrigin(event)
  requireSession(event, 'admin')
  const body = await readBody<{ currentPassword?: unknown, newPassword?: unknown }>(event)
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
  if (!await authenticate('admin', currentPassword)) {
    audit(event, 'admin', 'admin.password.change', 'failure', undefined, { reason: 'invalid_current_password' })
    apiError(401, 'INVALID_CREDENTIALS', '当前管理密码不正确')
  }
  await changePassword('admin', newPassword)
  audit(event, 'admin', 'admin.password.change', 'success')
  return { ok: true, sessionsRevoked: true }
})
