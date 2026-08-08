import { readBody, setResponseHeader } from 'h3'
import { assertHost, assertSameOrigin, getClientIp, hashForAudit, apiError } from '../../utils/http'
import { authenticate, createSession, audit } from '../../utils/auth'
import { clearRateLimit, consumeRateLimit } from '../../utils/rate-limit'

export default defineEventHandler(async (event) => {
  assertHost(event, 'admin')
  assertSameOrigin(event)
  const body = await readBody<{ password?: unknown }>(event)
  const password = typeof body?.password === 'string' ? body.password : ''
  const key = `admin:${hashForAudit(getClientIp(event))}`
  const retryAfter = consumeRateLimit(key)
  if (retryAfter) {
    setResponseHeader(event, 'Retry-After', retryAfter)
    audit(event, 'anonymous', 'admin.login', 'failure', undefined, { reason: 'rate_limited' })
    apiError(429, 'RATE_LIMITED', `尝试次数过多，请在 ${retryAfter} 秒后重试`)
  }
  if (!await authenticate('admin', password)) {
    audit(event, 'anonymous', 'admin.login', 'failure', undefined, { reason: 'invalid_password' })
    apiError(401, 'INVALID_CREDENTIALS', '管理密码不正确')
  }
  clearRateLimit(key)
  createSession(event, 'admin')
  audit(event, 'admin', 'admin.login', 'success')
  return { ok: true }
})
