import { readBody, setResponseHeader } from 'h3'
import { authenticate, audit, createSession } from '../../utils/auth'
import { apiError, assertHost, assertSameOrigin, getClientIp, hashForAudit, safeNextPath } from '../../utils/http'
import { clearRateLimit, consumeRateLimit } from '../../utils/rate-limit'

export default defineEventHandler(async (event) => {
  assertHost(event, 'viewer')
  assertSameOrigin(event)
  const body = await readBody<{ password?: unknown, next?: unknown }>(event)
  const password = typeof body?.password === 'string' ? body.password : ''
  const key = `viewer:${hashForAudit(getClientIp(event))}`
  const retryAfter = consumeRateLimit(key, 8)
  if (retryAfter) {
    setResponseHeader(event, 'Retry-After', retryAfter)
    audit(event, 'anonymous', 'viewer.login', 'failure', undefined, { reason: 'rate_limited' })
    apiError(429, 'RATE_LIMITED', `尝试次数过多，请在 ${retryAfter} 秒后重试`)
  }
  if (!await authenticate('viewer', password)) {
    audit(event, 'anonymous', 'viewer.login', 'failure', undefined, { reason: 'invalid_password' })
    apiError(401, 'INVALID_CREDENTIALS', '访问密码不正确')
  }
  clearRateLimit(key)
  createSession(event, 'viewer')
  audit(event, 'viewer', 'viewer.login', 'success')
  return { ok: true, next: safeNextPath(body.next) }
})
