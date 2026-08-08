import { createHash, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, getHeader, getRequestURL } from 'h3'
import type { AuthKind } from './config'
import { expectedHost } from './config'

export function apiError(statusCode: number, code: string, message: string): never {
  throw createError({ statusCode, statusMessage: message, data: { code, message } })
}

export function requestHost(event: H3Event): string {
  const forwarded = getHeader(event, 'x-forwarded-host')?.split(',')[0]?.trim()
  return (forwarded || getHeader(event, 'host') || '').toLowerCase()
}

export function assertHost(event: H3Event, kind: AuthKind): void {
  const expected = expectedHost(kind)
  if (expected && requestHost(event) !== expected) apiError(404, 'NOT_FOUND', '页面不存在')
}

export function assertSameOrigin(event: H3Event): void {
  const origin = getHeader(event, 'origin')
  if (!origin) return
  try {
    if (new URL(origin).host.toLowerCase() !== requestHost(event)) {
      apiError(403, 'ORIGIN_REJECTED', '请求来源不受信任')
    }
  }
  catch {
    apiError(403, 'ORIGIN_REJECTED', '请求来源不受信任')
  }
}

export function getClientIp(event: H3Event): string {
  const forwarded = getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || event.node.req.socket.remoteAddress || 'unknown'
}

export function hashForAudit(value: string): string {
  return createHash('sha256').update(`slidev-vault:${value}`).digest('hex').slice(0, 24)
}

export function ensureRequestId(event: H3Event): string {
  if (!event.context.requestId) event.context.requestId = randomUUID()
  return event.context.requestId as string
}

export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string' || value.includes('\\') || value.includes('\0')) return '/'
  try {
    const parsed = new URL(value, 'https://safe.invalid')
    const decoded = decodeURIComponent(parsed.pathname)
    if (parsed.origin !== 'https://safe.invalid' || !/^\/slides\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:[^?#]*)$/.test(decoded)) return '/'
    if (decoded.split('/').some(part => part === '..' || part === '.')) return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  }
  catch {
    return '/'
  }
}

export function currentUrl(event: H3Event): URL {
  return getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
}
