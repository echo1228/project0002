import { readMultipartFormData } from 'h3'
import { ArchiveError } from '../../../utils/archive'
import { audit, requireSession } from '../../../utils/auth'
import { getServerConfig } from '../../../utils/config'
import { createRevisionFromUpload, normalizeSlug, validateSlug } from '../../../utils/decks'
import { apiError, assertHost, assertSameOrigin } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  assertHost(event, 'admin')
  assertSameOrigin(event)
  requireSession(event, 'admin')
  const config = getServerConfig()
  const contentLength = Number.parseInt(event.node.req.headers['content-length'] || '0', 10)
  if (contentLength > config.maxUploadBytes) apiError(413, 'UPLOAD_TOO_LARGE', '上传文件超过大小限制')

  const parts = await readMultipartFormData(event)
  if (!parts) apiError(400, 'INVALID_MULTIPART', '上传表单格式不正确')
  const file = parts.find(part => part.name === 'file')
  const titlePart = parts.find(part => part.name === 'title')
  const slugPart = parts.find(part => part.name === 'slug')
  if (!file?.data || !file.filename) apiError(400, 'FILE_REQUIRED', '请选择 Markdown 或 ZIP 文件')
  if (file.data.length > config.maxUploadBytes) apiError(413, 'UPLOAD_TOO_LARGE', '上传文件超过大小限制')

  const fallbackTitle = file.filename.replace(/\.(md|zip)$/i, '')
  const title = (titlePart?.data.toString('utf8') || fallbackTitle).trim()
  const slug = normalizeSlug(slugPart?.data.toString('utf8') || fallbackTitle)
  if (!title || title.length > 100) apiError(400, 'INVALID_TITLE', '标题需要 1–100 个字符')
  const slugProblem = validateSlug(slug)
  if (slugProblem) apiError(400, 'INVALID_SLUG', slugProblem)

  try {
    const result = await createRevisionFromUpload({
      title,
      slug,
      filename: file.filename,
      buffer: file.data,
    })
    audit(event, 'admin', 'deck.upload', 'success', result.deckId, { slug, revisionId: result.revisionId })
    return { ok: true, ...result }
  }
  catch (error) {
    audit(event, 'admin', 'deck.upload', 'failure', undefined, { slug, error: error instanceof Error ? error.message : 'unknown' })
    if (error instanceof ArchiveError) apiError(400, 'INVALID_ARCHIVE', error.message)
    throw error
  }
})
