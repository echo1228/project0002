import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { H3Event } from 'h3'
import { getHeader, sendRedirect, sendStream, setResponseHeader } from 'h3'
import { contentType, lookup } from 'mime-types'
import { hasSession } from './auth'
import { getDataPaths } from './config'
import { getDeckBySlug } from './decks'
import { apiError, assertHost } from './http'

function safeAssetPath(value: string): string {
  let decoded = ''
  try {
    decoded = decodeURIComponent(value || '')
  }
  catch {
    apiError(400, 'INVALID_PATH', '无效的文件路径')
  }
  if (decoded.includes('\\') || decoded.includes('\0')) apiError(400, 'INVALID_PATH', '无效的文件路径')
  const parts = decoded.split('/').filter(Boolean)
  if (parts.some(part => part === '..' || part === '.')) apiError(400, 'INVALID_PATH', '无效的文件路径')
  return parts.join('/')
}

export async function serveDeck(event: H3Event, slug: string, requestedPath = '') {
  assertHost(event, 'viewer')
  if (!hasSession(event, 'viewer')) {
    const next = `/slides/${encodeURIComponent(slug)}/${safeAssetPath(requestedPath)}`
    if ((getHeader(event, 'accept') || '').includes('text/html')) {
      return sendRedirect(event, `/unlock?next=${encodeURIComponent(next)}`, 302)
    }
    apiError(401, 'AUTH_REQUIRED', '请先输入访问密码')
  }

  const deck = getDeckBySlug(slug)
  if (!deck?.active_revision_id) apiError(404, 'DECK_NOT_READY', '幻灯片不存在或尚未构建完成')
  const root = resolve(getDataPaths().published, deck.id, deck.active_revision_id)
  const relative = safeAssetPath(requestedPath) || 'index.html'
  let file = resolve(root, relative)
  const boundary = `${root}${sep}`
  if (file !== root && !file.startsWith(boundary)) apiError(400, 'INVALID_PATH', '无效的文件路径')

  let fileStat = await stat(file).catch(() => null)
  if (fileStat?.isDirectory()) {
    file = resolve(file, 'index.html')
    fileStat = await stat(file).catch(() => null)
  }
  if (!fileStat?.isFile() && !extname(relative)) {
    file = resolve(root, 'index.html')
    fileStat = await stat(file).catch(() => null)
  }
  if (!fileStat?.isFile()) apiError(404, 'ASSET_NOT_FOUND', '资源不存在')

  const mime = contentType(lookup(file) || 'application/octet-stream') || 'application/octet-stream'
  setResponseHeader(event, 'Content-Type', mime)
  setResponseHeader(event, 'Content-Length', fileStat.size)
  setResponseHeader(event, 'Cache-Control', file.endsWith('index.html')
    ? 'private, no-cache'
    : 'private, max-age=31536000, immutable')
  return sendStream(event, createReadStream(file))
}
