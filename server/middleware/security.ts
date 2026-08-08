import { getHeader, setHeader } from 'h3'
import { ensureRequestId, requestHost } from '../utils/http'
import { getServerConfig } from '../utils/config'

export default defineEventHandler((event) => {
  const requestId = ensureRequestId(event)
  setHeader(event, 'X-Request-Id', requestId)
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
  setHeader(event, 'Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  setHeader(event, 'Cross-Origin-Resource-Policy', 'same-origin')

  const { adminHost } = getServerConfig()
  const host = requestHost(event)
  if (!adminHost || host === adminHost) {
    setHeader(event, 'Content-Security-Policy', [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
    ].join('; '))
  }

  if (getHeader(event, 'x-forwarded-proto') === 'https') {
    setHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
})

declare module 'h3' {
  interface H3EventContext {
    requestId?: string
  }
}
