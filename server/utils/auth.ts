import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { deleteCookie, getCookie, getHeader, setCookie } from 'h3'
import type { AuthKind } from './config'
import { getServerConfig } from './config'
import { getDatabase, nowIso } from './db'
import { apiError, ensureRequestId, getClientIp, hashForAudit } from './http'
import { hashPassword, validatePassword, verifyPassword } from './password'

interface CredentialRow {
  password_hash: string
  version: number
}

interface SessionRow {
  credential_version: number
  expires_at: string
  current_version: number
}

const COOKIE_NAMES: Record<AuthKind, string> = {
  admin: 'slidev_vault_admin',
  viewer: 'slidev_vault_viewer',
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function ensureInitialCredentials(): Promise<void> {
  const db = getDatabase()
  const config = getServerConfig()
  const missing = db.prepare('SELECT kind FROM auth_credentials').all() as Array<{ kind: AuthKind }>
  const existing = new Set(missing.map(row => row.kind))

  let adminPassword = config.initialAdminPassword
  let viewerPassword = config.initialViewerPassword
  if (process.env.NODE_ENV !== 'production') {
    adminPassword ||= 'admin-change-me-now'
    viewerPassword ||= 'slides-change-me'
  }

  for (const [kind, password] of [['admin', adminPassword], ['viewer', viewerPassword]] as const) {
    if (existing.has(kind)) continue
    if (!password) throw new Error(`Missing initial ${kind} password`)
    const problem = validatePassword(password, kind)
    if (problem) throw new Error(`Invalid initial ${kind} password: ${problem}`)
    const passwordHash = await hashPassword(password)
    db.prepare(`
      INSERT INTO auth_credentials (kind, password_hash, version, updated_at)
      VALUES (?, ?, 1, ?)
    `).run(kind, passwordHash, nowIso())
  }
}

export async function authenticate(kind: AuthKind, password: string): Promise<boolean> {
  const row = getDatabase()
    .prepare('SELECT password_hash, version FROM auth_credentials WHERE kind = ?')
    .get(kind) as CredentialRow | undefined
  return row ? verifyPassword(row.password_hash, password) : false
}

export function createSession(event: H3Event, kind: AuthKind): void {
  const db = getDatabase()
  const credential = db
    .prepare('SELECT password_hash, version FROM auth_credentials WHERE kind = ?')
    .get(kind) as CredentialRow | undefined
  if (!credential) apiError(503, 'AUTH_NOT_READY', '认证服务尚未初始化')

  const config = getServerConfig()
  const maxAge = kind === 'admin' ? config.adminSessionSeconds : config.viewerSessionSeconds
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expires = new Date(now.getTime() + maxAge * 1000)
  db.prepare(`
    INSERT INTO auth_sessions (
      token_hash, kind, credential_version, created_at, expires_at, ip_hash, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    tokenHash(token),
    kind,
    credential.version,
    now.toISOString(),
    expires.toISOString(),
    hashForAudit(getClientIp(event)),
    (getHeader(event, 'user-agent') || '').slice(0, 300),
  )

  setCookie(event, COOKIE_NAMES[kind], token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge,
  })
}

export function hasSession(event: H3Event, kind: AuthKind): boolean {
  const token = getCookie(event, COOKIE_NAMES[kind])
  if (!token) return false
  const row = getDatabase().prepare(`
    SELECT s.credential_version, s.expires_at, c.version AS current_version
    FROM auth_sessions s
    JOIN auth_credentials c ON c.kind = s.kind
    WHERE s.token_hash = ? AND s.kind = ?
  `).get(tokenHash(token), kind) as SessionRow | undefined

  const valid = Boolean(
    row
    && row.credential_version === row.current_version
    && row.expires_at > nowIso(),
  )
  if (!valid) {
    getDatabase().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash(token))
  }
  return valid
}

export function requireSession(event: H3Event, kind: AuthKind): void {
  if (!hasSession(event, kind)) apiError(401, 'AUTH_REQUIRED', '请先登录')
}

export function revokeCurrentSession(event: H3Event, kind: AuthKind): void {
  const token = getCookie(event, COOKIE_NAMES[kind])
  if (token) getDatabase().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash(token))
  deleteCookie(event, COOKIE_NAMES[kind], {
    path: '/',
    secure: getServerConfig().cookieSecure,
    sameSite: 'strict',
  })
}

export async function changePassword(kind: AuthKind, newPassword: string): Promise<void> {
  const problem = validatePassword(newPassword, kind)
  if (problem) apiError(400, 'WEAK_PASSWORD', problem)
  const nextHash = await hashPassword(newPassword)
  const db = getDatabase()
  db.transaction(() => {
    const result = db.prepare(`
      UPDATE auth_credentials
      SET password_hash = ?, version = version + 1, updated_at = ?
      WHERE kind = ?
    `).run(nextHash, nowIso(), kind)
    if (result.changes !== 1) throw new Error(`Credential not found: ${kind}`)
    db.prepare('DELETE FROM auth_sessions WHERE kind = ?').run(kind)
  })()
}

export function cleanExpiredSessions(): void {
  getDatabase().prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(nowIso())
}

export function audit(
  event: H3Event | null,
  actor: string,
  action: string,
  outcome: 'success' | 'failure',
  target?: string,
  details?: Record<string, unknown>,
): void {
  getDatabase().prepare(`
    INSERT INTO audit_events (
      actor, action, target, outcome, request_id, ip_hash, created_at, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    actor,
    action,
    target || null,
    outcome,
    event ? ensureRequestId(event) : randomUUID(),
    event ? hashForAudit(getClientIp(event)) : null,
    nowIso(),
    details ? JSON.stringify(details) : null,
  )
}
