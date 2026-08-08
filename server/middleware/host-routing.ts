import { getRequestURL, sendRedirect } from 'h3'
import { getServerConfig } from '../utils/config'
import { requestHost } from '../utils/http'

export default defineEventHandler((event) => {
  if (event.method !== 'GET') return
  const path = getRequestURL(event).pathname
  if (path.startsWith('/api/') || path.startsWith('/slides/') || path === '/healthz' || path === '/readyz') return
  const { adminHost, slidesHost } = getServerConfig()
  const host = requestHost(event)
  if (slidesHost && host === slidesHost && (path === '/' || path === '/login')) {
    return sendRedirect(event, '/unlock', 302)
  }
  if (adminHost && host === adminHost && path === '/unlock') {
    return sendRedirect(event, '/', 302)
  }
})
